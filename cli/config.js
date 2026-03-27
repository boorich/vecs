import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import yaml from 'js-yaml'

const CONFIG_PATH = resolve(process.cwd(), 'config.yml')
const EXAMPLE_PATH = resolve(process.cwd(), 'config.yml.example')

function loadYaml() {
  const path = existsSync(CONFIG_PATH) ? CONFIG_PATH : existsSync(EXAMPLE_PATH) ? EXAMPLE_PATH : null
  if (!path) return {}
  return yaml.load(readFileSync(path, 'utf8')) || {}
}

const file = loadYaml()

export const config = {
  embedding: {
    model:      file.embedding?.model || 'BAAI/bge-small-en-v1.5',
    vectorSize: file.qdrant?.vector_size || 384,
  },
  qdrant: {
    url:    process.env.QDRANT_URL || file.qdrant?.url || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
  },
  domains: file.domains || {},
}

export function domainConfig(domain) {
  const defaults = config.domains.default || {}
  const overrides = config.domains[domain] || {}
  return {
    chunk_strategy: 'paragraph',
    chunk_size:     512,
    chunk_overlap:  64,
    ...defaults,
    ...overrides,
  }
}
