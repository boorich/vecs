import { get_encoding } from 'tiktoken'

/**
 * Split text into chunks using the given strategy.
 * @param {string} text
 * @param {'paragraph'|'token'|'code'} strategy
 * @param {{ chunk_size?: number, chunk_overlap?: number }} opts
 * @returns {string[]}
 */
export function chunkText(text, strategy = 'paragraph', opts = {}) {
  switch (strategy) {
    case 'paragraph': return chunkByParagraph(text)
    case 'token':     return chunkByToken(text, opts)
    case 'code':      return chunkByCode(text, opts)
    default: throw new Error(`Unknown chunk strategy: "${strategy}". Use paragraph, token, or code.`)
  }
}

function chunkByParagraph(text) {
  return text
    .split(/\n\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 50)
}

function chunkByToken(text, { chunk_size = 512, chunk_overlap = 64 } = {}) {
  const enc = get_encoding('cl100k_base')
  const tokens = enc.encode(text)
  const chunks = []
  let start = 0

  while (start < tokens.length) {
    const end = Math.min(start + chunk_size, tokens.length)
    const slice = tokens.slice(start, end)
    const decoded = new TextDecoder().decode(enc.decode(slice))
    chunks.push(decoded)
    if (end === tokens.length) break
    start += chunk_size - chunk_overlap
  }

  enc.free()
  return chunks.filter(c => c.trim().length >= 10)
}

// Matches the start of top-level function/class declarations in JS/TS
const CODE_BOUNDARY = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+\w+|^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(|^(?:export\s+)?class\s+\w+|^(?:export\s+)?(?:abstract\s+)?interface\s+\w+|^def\s+\w+|^class\s+\w+/

function chunkByCode(text, opts) {
  const lines = text.split('\n')
  const chunks = []
  let current = []

  for (const line of lines) {
    if (CODE_BOUNDARY.test(line.trim()) && current.length > 0) {
      const chunk = current.join('\n').trim()
      if (chunk.length >= 50) chunks.push(chunk)
      current = [line]
    } else {
      current.push(line)
    }
  }

  if (current.length > 0) {
    const chunk = current.join('\n').trim()
    if (chunk.length >= 50) chunks.push(chunk)
  }

  // Fall back to token chunking if no meaningful boundaries were found
  if (chunks.length <= 1) return chunkByToken(text, opts)
  return chunks
}
