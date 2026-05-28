# Auris

AI-powered always-on listening assistant for desktop. Continuously transcribes microphone audio locally with Whisper, captures screen OCR, stores everything in SQLite + ChromaDB, and lets you search and chat with Claude about what was heard and seen.

## Architecture

- **Tauri v2** — Rust shell + React UI + system tray
- **FastAPI sidecar** (Python, port `9847`) — audio, OCR, transcription, embeddings, AI
- **Data** — `~/.auris/data/` (SQLite, ChromaDB, audio chunks)
- **Logs** — `~/.auris/logs/sidecar.log`

## Prerequisites

### System (Linux)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  portaudio19-dev python3-pyaudio tesseract-ocr
```

### Python sidecar

```bash
cd sidecar
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

First run downloads Whisper and embedding models (~200MB total).

### Node

```bash
npm install
```

## Run

```bash
npm run tauri dev
```

Sidecar only:

```bash
npm run sidecar
```

## Features

### Phase 1
- Live microphone transcription (Whisper + VAD)
- SQLite storage + SSE live feed
- System tray

### Phase 2
- Periodic screenshot OCR (Tesseract, deduplicated)
- ChromaDB semantic search (`all-MiniLM-L6-v2`)
- Session summarization + action items (Claude, BYOK)
- RAG chat with citations
- History detail, Search, Ask Auris, Settings
- Desktop notification when summary is ready

## Settings

| Setting | Description |
|---------|-------------|
| Claude API key | Required for summaries and chat |
| Whisper model | `tiny.en`, `base.en`, `small.en` |
| Screenshot interval | 5s / 10s / 30s / off |
| Storage path | Custom data directory (restart required) |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Health, models, recording |
| POST | `/recording/start` | Start mic + OCR |
| POST | `/recording/stop` | Stop + trigger summarization |
| GET | `/stream` | SSE: transcript, summary_ready |
| GET | `/search?q=` | Semantic search |
| POST | `/chat` | RAG chat (SSE stream) |
| GET/POST | `/settings` | Preferences |

## License

MIT
# Auris
