#!/usr/bin/env node
import { Command } from 'commander'
import { ingest } from './ingest.js'
import { query } from './query.js'
import { list } from './list.js'

const program = new Command()

program
  .name('vecs')
  .description('Local vector DB cluster — ingest anything, query by similarity. No API keys required.')
  .version('0.1.0')

program
  .command('ingest <domain> [path]')
  .description('Ingest files or stdin into a Qdrant collection (domain)')
  .option('--chunk <strategy>', 'chunking strategy: paragraph | token | code')
  .option('--model <model>', 'fastembed model name (overrides config.yml)')
  .action(async (domain, path, opts) => {
    try {
      await ingest(domain, path, opts)
    } catch (err) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program
  .command('query <domain> <text>')
  .description('Query a collection by semantic similarity')
  .option('--top <n>', 'number of results to return', '5')
  .option('--json', 'output raw JSON (for piping)')
  .option('--model <model>', 'fastembed model name (overrides config.yml)')
  .action(async (domain, text, opts) => {
    try {
      await query(domain, text, opts)
    } catch (err) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program
  .command('list')
  .description('List all Qdrant collections with point counts')
  .action(async () => {
    try {
      await list()
    } catch (err) {
      console.error(`Error: ${err.message}`)
      process.exit(1)
    }
  })

program.parseAsync(process.argv)
