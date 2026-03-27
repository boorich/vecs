import { listCollections } from './qdrant.js'

export async function list() {
  const collections = await listCollections()

  if (collections.length === 0) {
    console.log('No collections found. Run `vecs ingest <domain> <path>` to create one.')
    return
  }

  const nameW = Math.max(10, ...collections.map(c => c.name.length)) + 2
  const header = `${'Collection'.padEnd(nameW)}${'Points'.padStart(8)}  ${'Vec Size'.padStart(8)}`
  console.log('\n' + header)
  console.log('─'.repeat(header.length))
  for (const c of collections) {
    console.log(
      `${c.name.padEnd(nameW)}${String(c.pointCount).padStart(8)}  ${String(c.vectorSize).padStart(8)}`
    )
  }
  console.log()
}
