import { embed } from './embed.js'
import { search } from './qdrant.js'
import { config } from './config.js'

export async function query(domain, text, opts = {}) {
  const topK = Math.max(1, parseInt(opts.top || '5', 10))
  const modelName = opts.model || config.embedding.model

  const [vector] = await embed([text], modelName)
  const results = await search(domain, vector, topK)

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  if (results.length === 0) {
    console.log('No results found.')
    return
  }

  for (const [i, r] of results.entries()) {
    const p = r.payload
    const preview = p.text.length > 500 ? p.text.slice(0, 500) + '…' : p.text
    console.log(`\n─── Result ${i + 1}  score: ${r.score.toFixed(4)} ───`)
    console.log(`Source: ${p.source}  (chunk #${p.chunk_index}, strategy: ${p.strategy})`)
    console.log(preview)
  }
  console.log()
}
