# YouTube Summarizer CLI

A Node.js CLI that downloads a YouTube video, extracts audio, transcribes it with whisper.cpp, and summarizes the transcript using OpenAI (default) or a local Ollama model. Includes caching, configurable verbosity, and interactive setup.

## Requirements
- Node.js 18+
- Package manager: npm or pnpm (examples use npm)
- External binaries:
  - `yt-dlp` (video download)
  - `ffmpeg` (audio extraction)
  - `whisper-cli` (whisper.cpp binary) — default path: `/usr/local/bin/whisper-cli`
  - Whisper model file — default path: `/usr/local/lib/whisper-models/ggml-base.en.bin`
  - Optional: `ollama` running locally if you choose the `ollama` summarizer
- API keys (optional):
  - `OPENAI_API_KEY` for OpenAI summarization (default backend)

## Install
```bash
npm install
npm run build
```

## First-time configuration
Run interactive setup (stores config at `~/.config/ytsum/config.json`):
```bash
node dist/cli.js --reconfigure
```
You can override any saved value with environment variables (e.g., `OPENAI_API_KEY`, `OPENAI_MODEL`, `WHISPER_BINARY`, `WHISPER_MODEL`, `OLLAMA_MODEL`, `CACHE_DIR`, `VERBOSITY`, `KEEP_TEMP`).

## Usage
Basic run (OpenAI default):
```bash
node dist/cli.js "https://www.youtube.com/watch?v=..."
```
Select summarizer:
```bash
node dist/cli.js --summarizer ollama "<url>"
node dist/cli.js --summarizer openai "<url>"
```
Verbosity levels (default: `standard`; also `concise`, `detailed`):
```bash
node dist/cli.js --verbosity detailed "<url>"
```
Caching options:
```bash
# Bypass cache
node dist/cli.js --skip-cache "<url>"
# Clean cache and exit
node dist/cli.js --clean-cache
# Clean cache then run
node dist/cli.js --clean-cache "<url>"
# Custom cache dir
node dist/cli.js --cache-dir /path/to/cache "<url>"
```
Other flags:
- `--whisper-binary` path to whisper.cpp binary (default `/usr/local/bin/whisper-cli`)
- `--whisper-model` path to whisper model (default `/usr/local/lib/whisper-models/ggml-base.en.bin`)
- `--openai-model` OpenAI model name (default `gpt-4o-mini`)
- `--ollama-model` Ollama model name (default `llama3.1`)
- `--keep-temp` keep temp artifacts

## Cache behavior
- Cached artifacts live under `CACHE_DIR` (default `~/.cache/ytsum`), hashed per URL.
- Summaries are keyed by verbosity level.
- Entries older than 48h are pruned automatically on runs (unless `--skip-cache`).
- `--clean-cache` deletes all cached artifacts.

## Notes
- Config file: `~/.config/ytsum/config.json` (written on first run or `--reconfigure`).
- External tools must be installed and on PATH: `yt-dlp`, `ffmpeg`, `whisper-cli` (and model file), optional `ollama`.
- No tests yet; code is structured for testability via dependency injection.
