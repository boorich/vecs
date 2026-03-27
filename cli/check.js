import { readFileSync, statSync } from 'fs'
import { resolve, extname, basename } from 'path'
import { get_encoding } from 'tiktoken'
import { chunkText } from './chunk.js'
import { embed } from './embed.js'
import { listCollections, search } from './qdrant.js'
import { config, domainConfig } from './config.js'

// ─── Public entry point ───────────────────────────────────────────────────────

export async function check(pathArg, opts = {}) {
  const { text, filename } = pathArg ? readFile(pathArg) : await readStdin()

  if (!opts.json) printHumanGate()

  const sizekb     = pathArg ? Math.round((statSync(resolve(pathArg)).size / 1024) * 10) / 10 : (Buffer.byteLength(text, 'utf8') / 1024).toFixed(1) * 1
  const language   = detectLanguage(filename, text)
  const { strategy, reason } = detectStrategy(text)
  const dc         = domainConfig('default')
  const chunks     = chunkText(text, strategy, { chunk_size: dc.chunk_size, chunk_overlap: dc.chunk_overlap })
  const noise      = detectNoise(text)
  const dupes      = await checkDuplicates(chunks, opts.collection)
  const flags      = buildFlags(noise, dupes, chunks)

  if (opts.json) {
    const out = {
      file:               filename,
      size_kb:            sizekb,
      encoding:           'UTF-8',
      language,
      suggested_strategy: strategy,
      strategy_reason:    reason,
      estimated_chunks:   chunks.length,
      noise_ratio:        parseFloat(noise.combined.toFixed(3)),
      duplicate_overlap:  dupes,
      chunk_previews:     chunks.slice(0, 2).map(c => c.slice(0, 200)),
      flags,
      suggested_command:  suggestedCommand(strategy, pathArg, opts.collection),
    }
    console.log(JSON.stringify(out, null, 2))
    return
  }

  printAnalysis({ filename, sizekb, language, strategy, reason, chunks, noise, dupes, flags })
  printSuggestedCommand(strategy, pathArg, opts.collection)
}

// ─── Human gate ──────────────────────────────────────────────────────────────

function printHumanGate() {
  console.log()
  console.log('─'.repeat(57))
  console.log('  Before you ingest, be honest:')
  console.log()
  console.log('  ◆ Would you search for this in 6 months, or are you')
  console.log('    keeping it because deleting feels wrong?')
  console.log('  ◆ Is this your synthesis, or just someone else\'s content')
  console.log('    you could web search again?')
  console.log('  ◆ Does this contain conclusions, or just the process')
  console.log('    that led to them?')
  console.log('  ◆ Is this specific enough to retrieve, or so general')
  console.log('    it adds noise?')
  console.log('  ◆ Would this still matter to you in a year?')
  console.log()
  console.log('  If you hesitated on any of these → refine the source first.')
  console.log('─'.repeat(57))
  console.log()
}

// ─── File reading ─────────────────────────────────────────────────────────────

function readFile(pathArg) {
  const p = resolve(pathArg)
  const text = readFileSync(p, 'utf8')
  return { text, filename: basename(p) }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const parts = []
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', d => parts.push(d))
    process.stdin.on('end', () => resolve({ text: parts.join(''), filename: 'stdin' }))
    process.stdin.on('error', reject)
  })
}

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_LANG = {
  '.md':   'markdown',
  '.txt':  'plain text',
  '.js':   'javascript',
  '.mjs':  'javascript',
  '.cjs':  'javascript',
  '.ts':   'typescript',
  '.tsx':  'typescript',
  '.py':   'python',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml':  'yaml',
  '.html': 'html',
  '.htm':  'html',
  '.css':  'css',
  '.sh':   'shell',
}

function detectLanguage(filename, text) {
  const ext = extname(filename).toLowerCase()
  if (EXT_LANG[ext]) return EXT_LANG[ext]
  // fallback: keyword scan
  if (/^(def |class |import |from )/m.test(text))         return 'python'
  if (/^(function |const |let |var |import )/m.test(text)) return 'javascript'
  if (/^(#|##|###)/m.test(text))                           return 'markdown'
  return 'unknown'
}

// ─── Strategy detection ───────────────────────────────────────────────────────

function detectStrategy(text) {
  const lines = text.split('\n')
  const totalLines = lines.length || 1

  // Code signals
  const codeKeywords = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|def|import|from)\b/
  const codeLines = lines.filter(l => codeKeywords.test(l.trim())).length
  const codeScore = codeLines / totalLines

  // Token/transcript signals
  const timestampLines = lines.filter(l => /\d{1,2}:\d{2}/.test(l)).length
  const speakerLines   = lines.filter(l => /^[A-Z][a-zA-Z\s]{1,20}:\s/.test(l)).length
  const tokenScore = (timestampLines + speakerLines) / totalLines

  // Paragraph signals
  const doubleNewlines = (text.match(/\n\n+/g) || []).length
  const markdownHeaders = lines.filter(l => /^#{1,4}\s/.test(l)).length
  const paraScore = (doubleNewlines / totalLines) + (markdownHeaders / totalLines)

  if (codeScore > 0.1) {
    return { strategy: 'code', reason: `code-like structure detected (${Math.round(codeScore * 100)}% of lines are declarations)` }
  }
  if (tokenScore > 0.08) {
    const what = timestampLines > speakerLines ? 'timestamps' : 'speaker labels'
    return { strategy: 'token', reason: `transcript-like structure detected (${what}, low paragraph density)` }
  }
  if (paraScore > 0.05 || markdownHeaders > 0) {
    const what = markdownHeaders > 0 ? 'markdown headers' : 'double-newline paragraph breaks'
    return { strategy: 'paragraph', reason: `prose structure detected (${what})` }
  }
  return { strategy: 'paragraph', reason: 'no strong signals — defaulting to paragraph' }
}

// ─── Noise detection ──────────────────────────────────────────────────────────

function detectNoise(text) {
  const lines = text.split('\n')
  const total = lines.length || 1

  const blankLines = lines.filter(l => l.trim() === '').length
  const whitespaceRatio = blankLines / total

  // Boilerplate signals
  const htmlTagLines    = lines.filter(l => /<[a-zA-Z][^>]*>/.test(l)).length
  const emailHeaderLines = lines.filter(l => /^(From|To|Subject|Date|Cc|Reply-To):\s/i.test(l)).length
  const repeatedLines   = total - new Set(lines.map(l => l.trim()).filter(l => l.length > 5)).size - blankLines
  const boilerplateRatio = Math.min(1, (htmlTagLines + emailHeaderLines + Math.max(0, repeatedLines)) / total)

  const combined = Math.min(1, whitespaceRatio * 0.4 + boilerplateRatio * 0.6)

  return { whitespaceRatio, boilerplateRatio, combined, blankLines, total }
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

async function checkDuplicates(chunks, collectionFilter) {
  const sample = chunks.slice(0, 3)
  if (sample.length === 0) return []

  let collections
  try {
    const all = await listCollections()
    if (all.length === 0) return []
    collections = collectionFilter
      ? all.filter(c => c.name === collectionFilter)
      : all
    if (collections.length === 0 && collectionFilter) {
      process.stderr.write(`  Collection '${collectionFilter}' not found — skipping duplicate check.\n`)
      return []
    }
  } catch {
    process.stderr.write('  Qdrant unreachable — skipping duplicate check.\n')
    return []
  }

  process.stderr.write('  Checking for duplicates...')
  let vectors
  try {
    vectors = await embed(sample, config.embedding.model)
  } catch {
    process.stderr.write(' failed (embedding error).\n')
    return []
  }
  process.stderr.write(' done.\n')

  const results = []
  for (const col of collections) {
    let topScore = 0
    let matchCount = 0
    for (const vec of vectors) {
      try {
        const hits = await search(col.name, vec, 1)
        if (hits.length > 0) {
          const score = hits[0].score
          if (score > topScore) topScore = score
          if (score > 0.80) matchCount++
        }
      } catch {
        // skip this collection
      }
    }
    if (topScore > 0) {
      results.push({
        collection:   col.name,
        score:        parseFloat(topScore.toFixed(4)),
        overlap_pct:  Math.round((matchCount / vectors.length) * 100),
      })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

// ─── Flags ────────────────────────────────────────────────────────────────────

function buildFlags(noise, dupes, chunks) {
  const flags = []
  if (noise.combined > 0.25) flags.push('high_noise')
  if (dupes.some(d => d.score > 0.95)) flags.push('near_duplicate')
  const enc = get_encoding('cl100k_base')
  const shortChunks = chunks.filter(c => enc.encode(c).length < 30).length
  enc.free()
  if (shortChunks > 0) flags.push(`${shortChunks}_short_chunks`)
  return flags
}

// ─── Token count helper ───────────────────────────────────────────────────────

function tokenCount(text) {
  const enc = get_encoding('cl100k_base')
  const n = enc.encode(text).length
  enc.free()
  return n
}

// ─── Output: analysis ────────────────────────────────────────────────────────

function printAnalysis({ filename, sizekb, language, strategy, reason, chunks, noise, dupes, flags }) {
  const sep = '─'.repeat(57)

  // FILE INFO
  console.log(sep)
  console.log('  FILE INFO')
  console.log(sep)
  console.log(`  File:      ${filename}`)
  console.log(`  Size:      ${sizekb} KB`)
  console.log(`  Encoding:  UTF-8`)
  console.log(`  Language:  ${language}`)
  console.log()

  // STRUCTURE SIGNAL
  console.log(sep)
  console.log('  STRUCTURE SIGNAL')
  console.log(sep)
  console.log(`  Suggested strategy: ${strategy}`)
  console.log(`  Reason: ${reason}`)
  console.log()

  // CHUNK PREVIEW
  console.log(sep)
  console.log('  CHUNK PREVIEW')
  console.log(sep)
  console.log(`  Estimated chunks: ${chunks.length}`)
  console.log()

  if (chunks.length > 0) {
    const tokenCounts = chunks.map(c => tokenCount(c))
    const minTokens = Math.min(...tokenCounts)
    const maxTokens = Math.max(...tokenCounts)
    const shortChunks = tokenCounts.filter(t => t < 30).length

    chunks.slice(0, 2).forEach((c, i) => {
      const preview = c.length > 200 ? c.slice(0, 200) + '…' : c
      console.log(`  Preview ${i + 1}:`)
      console.log(`  ${preview.replace(/\n/g, '\n  ')}`)
      console.log()
    })

    console.log(`  Shortest chunk: ${minTokens} tokens`)
    console.log(`  Longest chunk:  ${maxTokens} tokens`)
    if (shortChunks > 0) {
      console.log(`  ⚠  ${shortChunks} chunk${shortChunks > 1 ? 's' : ''} under 30 tokens — likely noise`)
    }
    console.log()
  }

  // NOISE INDICATORS
  console.log(sep)
  console.log('  NOISE INDICATORS')
  console.log(sep)
  console.log(`  Whitespace/blank lines: ${Math.round(noise.whitespaceRatio * 100)}%`)
  console.log(`  Boilerplate signals:    ${Math.round(noise.boilerplateRatio * 100)}%`)
  if (flags.includes('high_noise')) {
    console.log()
    console.log('  ⚠  High noise ratio — consider cleaning first')
  }
  console.log()

  // DUPLICATE OVERLAP
  console.log(sep)
  console.log('  DUPLICATE OVERLAP')
  console.log(sep)
  if (dupes.length === 0) {
    console.log('  No existing collections to compare against.')
  } else {
    for (const d of dupes) {
      console.log(`  ${d.overlap_pct}% overlap with collection: ${d.collection} (top match: ${d.score})`)
      if (d.score > 0.95) {
        console.log('  ⚠  Near-duplicate content already exists')
      }
    }
  }
  console.log()
}

// ─── Output: suggested command ────────────────────────────────────────────────

function printSuggestedCommand(strategy, pathArg, collection) {
  const sep = '─'.repeat(57)
  console.log(sep)
  console.log('  Ready to ingest? Run:')
  console.log()
  console.log(`  ${suggestedCommand(strategy, pathArg, collection)}`)
  console.log(sep)
  console.log()
}

function suggestedCommand(strategy, pathArg, collection) {
  const domain  = collection || '<collection>'
  const pathStr = pathArg || '<path>'
  return `vecs ingest ${domain} ${pathStr} --chunk ${strategy}`
}
