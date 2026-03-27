# vecs

Local-first CLI tool for building and querying domain-scoped vector databases.
No API keys required — everything runs on your machine.

**Stack:** Qdrant · fastembed (BAAI/bge-small-en-v1.5, ~130 MB, cached locally) · Node.js 18+

---

## Native install (daily use)

Installs Qdrant as a macOS background daemon and places `vecs` in your PATH.
Qdrant starts automatically on login. No Docker required.

```bash
npm run install:system
```

The installer:
- Downloads the Qdrant binary for your CPU (arm64 or x86_64) from GitHub releases
- Registers it as a launchd user daemon (`~/Library/LaunchAgents/dev.vecs.qdrant.plist`)
- Creates `~/.vecs/data/` for persistent vector storage
- Links the `vecs` CLI into your PATH via `npm link`

To remove everything:

```bash
npm run uninstall:system
```

---

## Development setup

For hacking on vecs itself, or running it from the repo without a system install.

### 1. Start Qdrant

```bash
docker compose up -d
```

Qdrant runs at `http://localhost:6333`. Data is persisted in `./qdrant_data/`.

### 2. Configure (optional)

```bash
cp config.yml.example config.yml
cp .env.example .env
```

Defaults work out of the box. Edit `config.yml` to change the embedding model or per-domain chunk strategies.

### 3. Link CLI

```bash
sudo npm link
```

Or run without installing:

```bash
node cli/index.js <command>
```

---

## Commands

### `vecs ingest <domain> [path]`

Ingest a file, directory, or stdin into a named Qdrant collection.

```bash
# Ingest a single file
vecs ingest research examples/sample-data/research.md

# Ingest a directory (recursively finds .md .txt .js .ts .json)
vecs ingest docs ./my-notes/

# Pipe from stdin
cat meeting-notes.txt | vecs ingest transcripts --chunk token

# Override chunking strategy
vecs ingest codebase ./src --chunk code
```

**Options:**

| Flag | Description |
|------|-------------|
| `--chunk <strategy>` | `paragraph` (default) \| `token` \| `code` |
| `--model <name>` | fastembed model name (overrides config.yml) |

The domain becomes the Qdrant collection name and is created automatically on first ingest.

### `vecs query <domain> "<text>"`

Search a collection by semantic similarity.

```bash
vecs query research "how does self-attention work?"

# Return top 10 results
vecs query docs "deployment steps" --top 10

# Machine-readable JSON output
vecs query research "transformer architecture" --json | jq '.[0].payload.text'
```

**Options:**

| Flag | Description |
|------|-------------|
| `--top <n>` | Number of results (default: 5) |
| `--json` | Output raw JSON for piping |
| `--model <name>` | fastembed model name |

### `vecs list`

List all collections with point counts and vector dimensions.

```bash
vecs list
```

### `vecs check [path]`

Analyse a file before ingesting. Surfaces noise, duplicates, and chunk previews. Includes mandatory reflection prompts to keep your collections clean.

```bash
# Check a file
vecs check notes/meeting.md

# Check against a specific collection only
vecs check notes/meeting.md --collection docs

# Machine-readable output for scripting (skips human prompts)
vecs check notes/meeting.md --json
```

**What it does, in order:**

1. **Reflection prompts** — five questions you must read before seeing the data. Not skippable. The friction is intentional.
2. **File info** — filename, size, encoding, detected language.
3. **Structure signal** — guesses the best chunk strategy (`paragraph` / `token` / `code`) from content patterns, with a one-line reason.
4. **Chunk preview** — estimated chunk count, first 2 chunk previews, shortest/longest chunk by token count. Flags any chunk under 30 tokens as likely noise.
5. **Noise indicators** — whitespace ratio and boilerplate signals (HTML tags, email headers, repeated lines). Warns if > 25% looks noisy.
6. **Duplicate overlap** — embeds a sample of 3 chunks and runs similarity search against existing collections. Reports overlap percentage and top match score per collection. Warns on near-duplicates (score > 0.95).
7. **Suggested ingest command** — the exact `vecs ingest` command to copy-paste.

**Options:**

| Flag | Description |
|------|-------------|
| `--collection <name>` | Check overlap against one collection only (default: all) |
| `--json` | Output raw JSON, skip human prompts |

**JSON output shape:**

```json
{
  "file": "meeting.md",
  "size_kb": 12.4,
  "encoding": "UTF-8",
  "language": "markdown",
  "suggested_strategy": "paragraph",
  "strategy_reason": "prose structure detected (markdown headers)",
  "estimated_chunks": 18,
  "noise_ratio": 0.04,
  "duplicate_overlap": [
    { "collection": "docs", "score": 0.87, "overlap_pct": 33 }
  ],
  "chunk_previews": ["...", "..."],
  "flags": [],
  "suggested_command": "vecs ingest <collection> notes/meeting.md --chunk paragraph"
}
```

---

## Chunking strategies

| Strategy | Best for | How it works |
|----------|----------|-------------|
| `paragraph` | Markdown, notes, Notion exports | Splits on `\n\n`, skips chunks < 50 chars |
| `token` | Transcripts, long prose | Overlapping windows of N tokens (tiktoken cl100k_base) |
| `code` | JS/TS/Python source files | Splits on function/class boundaries, falls back to token |

Set per-domain defaults in `config.yml`:

```yaml
domains:
  code:
    chunk_strategy: code
  transcripts:
    chunk_strategy: token
    chunk_size: 400
```

---

## Pipe examples

```bash
# Ingest a GitHub issue from curl
curl -s https://api.github.com/repos/org/repo/issues/42 \
  | jq -r '.body' \
  | vecs ingest issues --chunk paragraph

# Ingest every markdown file in a directory
vecs ingest docs ./wiki

# Query and extract just the text of the top result
vecs query docs "authentication flow" --top 1 --json \
  | jq -r '.[0].payload.text'

# Ingest clipboard contents (macOS)
pbpaste | vecs ingest scratch
```

---

## Configuration reference

`config.yml` (copy from `config.yml.example`):

```yaml
embedding:
  model: BAAI/bge-small-en-v1.5   # fastembed model; downloaded once, cached in ~/.cache/fastembed

qdrant:
  url: http://localhost:6333
  vector_size: 384                  # must match the chosen model's output dimension

domains:
  default:
    chunk_strategy: paragraph
    chunk_size: 512
    chunk_overlap: 64
```

`.env` (copy from `.env.example`):

```bash
QDRANT_URL=http://localhost:6333
# QDRANT_API_KEY=   # only if you add auth to Qdrant
```

---

## Requirements

- Node.js 18+
- ~130 MB disk space for the embedding model (downloaded once to `~/.cache/fastembed`)
- Docker — only for the development setup, not required for native install

---

## Notes

- **Re-ingesting** the same file adds duplicate points. Deduplication by source is a planned future feature.
- **First run** triggers a one-time model download; subsequent runs use the local cache.
- **Vector size** (384 for bge-small-en-v1.5) must match the collection's vector size. If you change models, create a new domain or delete the existing collection.
