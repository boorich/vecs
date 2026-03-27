import { readFileSync, statSync, readdirSync } from 'fs'
import { resolve, extname } from 'path'
import { chunkText } from './chunk.js'
import { embed } from './embed.js'
import { ensureCollection, upsertPoints } from './qdrant.js'
import { config, domainConfig } from './config.js'

const SUPPORTED_EXT = new Set(['.md', '.txt', '.js', '.ts', '.json'])

export async function ingest(domain, pathArg, opts = {}) {
  const dc = domainConfig(domain)
  const strategy = opts.chunk || dc.chunk_strategy
  const modelName = opts.model || config.embedding.model

  await ensureCollection(domain, config.embedding.vectorSize)

  if (pathArg) {
    const files = collectFiles(resolve(pathArg))
    if (files.length === 0) {
      console.error(`No supported files found at: ${pathArg}`)
      process.exit(1)
    }
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      await ingestText(text, file, domain, strategy, dc, modelName)
    }
  } else {
    const text = await readStdin()
    if (!text.trim()) {
      console.error('No input received on stdin.')
      process.exit(1)
    }
    await ingestText(text, 'stdin', domain, strategy, dc, modelName)
  }
}

function collectFiles(p) {
  const stat = statSync(p)
  if (stat.isFile()) return [p]
  if (stat.isDirectory()) {
    return walkDir(p).filter(f => SUPPORTED_EXT.has(extname(f)))
  }
  return []
}

function walkDir(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkDir(full))
    else if (entry.isFile()) results.push(full)
  }
  return results
}

async function ingestText(text, source, domain, strategy, dc, modelName) {
  const chunks = chunkText(text, strategy, {
    chunk_size:    dc.chunk_size,
    chunk_overlap: dc.chunk_overlap,
  })

  if (chunks.length === 0) {
    console.log(`  Skipping ${source} — no chunks produced.`)
    return
  }

  process.stdout.write(`  Embedding ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} from ${source}...`)
  const vectors = await embed(chunks, modelName)
  console.log(' done.')

  const ingested_at = new Date().toISOString()
  const points = chunks.map((text, i) => ({
    text,
    source,
    chunk_index:  i,
    strategy,
    ingested_at,
    vector:       vectors[i],
  }))

  await upsertPoints(domain, points)
  console.log(`  Ingested ${points.length} chunk${points.length === 1 ? '' : 's'} into '${domain}'.`)
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const parts = []
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', d => parts.push(d))
    process.stdin.on('end', () => resolve(parts.join('')))
    process.stdin.on('error', reject)
  })
}
