import { QdrantClient } from '@qdrant/js-client-rest'
import { randomUUID } from 'crypto'
import { config } from './config.js'

let _client = null

function client() {
  if (!_client) {
    _client = new QdrantClient({
      url: config.qdrant.url,
      ...(config.qdrant.apiKey ? { apiKey: config.qdrant.apiKey } : {}),
    })
  }
  return _client
}

export async function ensureCollection(name, vectorSize) {
  const c = client()
  const { collections } = await c.getCollections()
  if (collections.some(col => col.name === name)) return

  await c.createCollection(name, {
    vectors: { size: vectorSize, distance: 'Cosine' },
  })
}

/**
 * @param {string} collection
 * @param {Array<{ text: string, source: string, chunk_index: number, strategy: string, ingested_at: string, vector: Float32Array }>} points
 */
export async function upsertPoints(collection, points) {
  const c = client()
  await c.upsert(collection, {
    wait: true,
    points: points.map(p => ({
      id: randomUUID(),
      vector: Array.from(p.vector),
      payload: {
        text:        p.text,
        source:      p.source,
        chunk_index: p.chunk_index,
        strategy:    p.strategy,
        ingested_at: p.ingested_at,
      },
    })),
  })
}

/**
 * @param {string} collection
 * @param {Float32Array} vector
 * @param {number} topK
 */
export async function search(collection, vector, topK = 5) {
  return client().search(collection, {
    vector: Array.from(vector),
    limit: topK,
    with_payload: true,
  })
}

export async function listCollections() {
  const c = client()
  const { collections } = await c.getCollections()
  return Promise.all(
    collections.map(async col => {
      const info = await c.getCollection(col.name)
      const vectors = info.config?.params?.vectors
      const vectorSize = vectors?.size ?? vectors?.default?.size ?? '?'
      return {
        name:        col.name,
        pointCount:  info.points_count ?? 0,
        vectorSize,
      }
    })
  )
}
