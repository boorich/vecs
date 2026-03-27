import { FlagEmbedding, EmbeddingModel } from 'fastembed'

// Map user-facing model names (from config.yml) to fastembed enum values
const MODEL_MAP = {
  'BAAI/bge-small-en-v1.5':            EmbeddingModel.BGESmallENV15,
  'BAAI/bge-small-en':                 EmbeddingModel.BGESmallEN,
  'BAAI/bge-base-en-v1.5':             EmbeddingModel.BGEBaseENV15,
  'BAAI/bge-base-en':                  EmbeddingModel.BGEBaseEN,
  'sentence-transformers/all-MiniLM-L6-v2': EmbeddingModel.AllMiniLML6V2,
}

let cachedModel = null
let cachedModelName = null

/**
 * Embed an array of texts using fastembed.
 * Lazily initialises the model on first call and reuses it across calls.
 * @param {string[]} texts
 * @param {string} [modelName]
 * @returns {Promise<Float32Array[]>}
 */
export async function embed(texts, modelName = 'BAAI/bge-small-en-v1.5') {
  if (!cachedModel || cachedModelName !== modelName) {
    if (!cachedModel) {
      process.stderr.write(
        'Loading embedding model (first run downloads ~130 MB to ~/.cache/fastembed)...\n'
      )
    }
    const modelId = MODEL_MAP[modelName] ?? modelName
    cachedModel = await FlagEmbedding.init({ model: modelId })
    cachedModelName = modelName
  }

  const results = []
  for await (const batch of cachedModel.embed(texts)) {
    results.push(...batch)
  }
  return results
}
