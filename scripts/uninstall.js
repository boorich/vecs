#!/usr/bin/env node
/**
 * vecs system uninstaller
 *
 * Stops and removes the Qdrant launchd daemon, optionally deletes all
 * stored data, and unlinks the vecs CLI from PATH.
 *
 * Usage:  npm run uninstall:system
 */

import { execSync, spawnSync } from 'child_process'
import { existsSync, rmSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import { createInterface } from 'readline'

// ─── Paths ────────────────────────────────────────────────────────────────────

const HOME       = homedir()
const VECS_DIR   = resolve(HOME, '.vecs')
const PLIST_DEST = resolve(HOME, 'Library', 'LaunchAgents', 'dev.vecs.qdrant.plist')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { process.stdout.write(`  ${msg}\n`) }
function ok(msg)   { process.stdout.write(`  ✓ ${msg}\n`) }
function warn(msg) { process.stdout.write(`  ⚠  ${msg}\n`) }
function sep()     { process.stdout.write('─'.repeat(57) + '\n') }

function run(cmd) {
  return spawnSync(cmd, { shell: true, stdio: 'pipe' })
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()) })
  })
}

// ─── Stop + unload launchd service ───────────────────────────────────────────

function unloadDaemon() {
  if (!existsSync(PLIST_DEST)) {
    warn('No launchd plist found — Qdrant daemon was not installed or already removed.')
    return
  }
  run(`launchctl unload "${PLIST_DEST}"`)
  ok('Qdrant daemon stopped and unloaded')

  rmSync(PLIST_DEST, { force: true })
  ok(`Removed ${PLIST_DEST}`)
}

// ─── Remove ~/.vecs/ ─────────────────────────────────────────────────────────

async function removeData() {
  if (!existsSync(VECS_DIR)) {
    log('~/.vecs/ does not exist — nothing to remove.')
    return
  }

  console.log()
  console.log('  Your vector data and Qdrant binary are stored at:')
  console.log(`  ${VECS_DIR}`)
  console.log()
  const answer = await prompt('  Delete all data? This cannot be undone. [y/N] ')

  if (answer === 'y' || answer === 'yes') {
    rmSync(VECS_DIR, { recursive: true, force: true })
    ok(`Deleted ${VECS_DIR}`)
  } else {
    log(`Kept ${VECS_DIR} — your data is intact.`)
  }
}

// ─── npm unlink ───────────────────────────────────────────────────────────────

function unlinkCli() {
  log('Removing vecs CLI from PATH...')
  let result = run('npm unlink -g vecs')
  if (result.status === 0) {
    ok('vecs CLI removed')
    return
  }
  result = spawnSync('sudo', ['npm', 'unlink', '-g', 'vecs'], { stdio: 'inherit', shell: false })
  if (result.status === 0) {
    ok('vecs CLI removed via sudo')
  } else {
    warn('Could not remove vecs CLI automatically.')
    warn('Run manually: sudo npm unlink -g vecs')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  sep()
  log('vecs uninstaller')
  sep()
  console.log()

  if (process.platform !== 'darwin') {
    console.error('Error: this uninstaller is macOS only.')
    process.exit(1)
  }

  unloadDaemon()
  await removeData()
  unlinkCli()

  console.log()
  sep()
  log('Uninstall complete.')
  sep()
  console.log()
}

main()
