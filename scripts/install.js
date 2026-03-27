#!/usr/bin/env node
/**
 * vecs system installer
 *
 * Downloads the Qdrant binary for your macOS arch, registers it as a
 * launchd user daemon (starts on login, always running), and places
 * the vecs CLI in PATH via npm link.
 *
 * Usage:  npm run install:system
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, createWriteStream } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import { pipeline } from 'stream/promises'
import tar from 'tar'

// ─── Paths ────────────────────────────────────────────────────────────────────

const HOME        = homedir()
const VECS_DIR    = resolve(HOME, '.vecs')
const BIN_DIR       = resolve(VECS_DIR, 'bin')
const DATA_DIR      = resolve(VECS_DIR, 'data')
const SNAPSHOTS_DIR = resolve(VECS_DIR, 'snapshots')
const LOG_DIR       = resolve(VECS_DIR, 'logs')
const QDRANT_BIN  = resolve(BIN_DIR, 'qdrant')
const PLIST_DEST  = resolve(HOME, 'Library', 'LaunchAgents', 'dev.vecs.qdrant.plist')
const PLIST_SRC   = resolve(new URL('.', import.meta.url).pathname, '..', 'release', 'qdrant.plist')
const LABEL       = 'dev.vecs.qdrant'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { process.stdout.write(`  ${msg}\n`) }
function ok(msg)   { process.stdout.write(`  ✓ ${msg}\n`) }
function warn(msg) { process.stdout.write(`  ⚠  ${msg}\n`) }
function sep()     { process.stdout.write('─'.repeat(57) + '\n') }

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, stdio: 'pipe', ...opts })
}

// ─── GitHub: resolve latest Qdrant release ───────────────────────────────────

async function getLatestQdrantAsset() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  const assetName = `qdrant-${arch}-apple-darwin.tar.gz`

  log('Fetching latest Qdrant release from GitHub...')
  const res = await fetch('https://api.github.com/repos/qdrant/qdrant/releases/latest', {
    headers: { 'User-Agent': 'vecs-installer' },
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  const release = await res.json()
  const asset = release.assets.find(a => a.name === assetName)
  if (!asset) throw new Error(`No asset named "${assetName}" found in latest Qdrant release`)
  return { url: asset.browser_download_url, version: release.tag_name, assetName }
}

// ─── Download + extract Qdrant binary ────────────────────────────────────────

async function downloadQdrant({ url, version, assetName }) {
  log(`Downloading Qdrant ${version} (${assetName})...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

  mkdirSync(BIN_DIR, { recursive: true })

  // Stream: response body → gunzip + tar extract → BIN_DIR
  await pipeline(
    res.body,
    tar.x({ cwd: BIN_DIR, gz: true })
  )

  if (!existsSync(QDRANT_BIN)) throw new Error(`Qdrant binary not found at ${QDRANT_BIN} after extraction`)
  chmodSync(QDRANT_BIN, 0o755)
  ok(`Qdrant ${version} installed at ${QDRANT_BIN}`)
}

// ─── Create data + log directories ───────────────────────────────────────────

function ensureDirs() {
  mkdirSync(DATA_DIR,      { recursive: true })
  mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  mkdirSync(LOG_DIR,       { recursive: true })
  ok(`Data directory:      ${DATA_DIR}`)
  ok(`Snapshots directory: ${SNAPSHOTS_DIR}`)
  ok(`Log directory:       ${LOG_DIR}`)
}

// ─── Write launchd plist ──────────────────────────────────────────────────────

function installPlist() {
  const template = readFileSync(PLIST_SRC, 'utf8')
  const plist = template
    .replace('QDRANT_BIN',       QDRANT_BIN)
    .replaceAll('QDRANT_DATA',   DATA_DIR)
    .replace('QDRANT_SNAPSHOTS', SNAPSHOTS_DIR)
    .replace('QDRANT_LOG_OUT',   resolve(LOG_DIR, 'qdrant.out.log'))
    .replace('QDRANT_LOG_ERR',   resolve(LOG_DIR, 'qdrant.err.log'))

  mkdirSync(resolve(HOME, 'Library', 'LaunchAgents'), { recursive: true })
  writeFileSync(PLIST_DEST, plist, 'utf8')
  ok(`launchd plist written to ${PLIST_DEST}`)
}

// ─── Load launchd service ─────────────────────────────────────────────────────

function loadDaemon() {
  // Unload first in case it was previously loaded (idempotent)
  run(`launchctl unload "${PLIST_DEST}" 2>/dev/null`)
  const result = run(`launchctl load "${PLIST_DEST}"`)
  if (result.status !== 0) {
    warn(`launchctl load failed: ${result.stderr.toString().trim()}`)
    warn('You can start Qdrant manually: launchctl load ~/Library/LaunchAgents/dev.vecs.qdrant.plist')
    return
  }
  ok('Qdrant daemon loaded (starts automatically on login)')
}

// ─── Wait for Qdrant to be ready ─────────────────────────────────────────────

async function waitForQdrant(retries = 15, delayMs = 500) {
  log('Waiting for Qdrant to be ready...')
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://localhost:6333/healthz')
      if (res.ok) { ok('Qdrant is running at http://localhost:6333'); return true }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, delayMs))
  }
  warn('Qdrant did not respond in time — it may still be starting. Check: curl http://localhost:6333/healthz')
  return false
}

// ─── npm link ────────────────────────────────────────────────────────────────

function linkCli() {
  log('Linking vecs CLI into PATH...')
  // Try without sudo first
  let result = run('npm link', { cwd: resolve(new URL('.', import.meta.url).pathname, '..') })
  if (result.status === 0) {
    ok('vecs CLI linked (run `vecs --help` to verify)')
    return
  }
  // Fall back to sudo
  warn('npm link failed without sudo — retrying with sudo...')
  result = spawnSync('sudo', ['npm', 'link'], {
    cwd: resolve(new URL('.', import.meta.url).pathname, '..'),
    stdio: 'inherit',
    shell: false,
  })
  if (result.status === 0) {
    ok('vecs CLI linked via sudo')
  } else {
    warn('Could not link vecs CLI automatically.')
    warn('Run manually: sudo npm link')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  sep()
  log('vecs system installer')
  sep()
  console.log()

  if (process.platform !== 'darwin') {
    console.error('Error: this installer is macOS only.')
    process.exit(1)
  }

  try {
    const asset = await getLatestQdrantAsset()
    await downloadQdrant(asset)
    ensureDirs()
    installPlist()
    loadDaemon()
    await waitForQdrant()
    linkCli()

    console.log()
    sep()
    log('Installation complete.')
    log('')
    log('Qdrant runs in the background and starts on every login.')
    log('Your data lives at: ~/.vecs/data/')
    log('Logs at:            ~/.vecs/logs/')
    log('')
    log('Get started:')
    log('  vecs ingest <collection> <path>')
    log('  vecs query  <collection> "<question>"')
    log('  vecs list')
    sep()
    console.log()
  } catch (err) {
    console.error(`\nInstallation failed: ${err.message}`)
    process.exit(1)
  }
}

main()
