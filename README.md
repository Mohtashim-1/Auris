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

### Node

```bash
npm install
```

## Run

```bash
npm run tauri dev
```

## Features by phase

### Phase 1 — Core listening
- Live microphone transcription (Whisper + VAD)
- SQLite storage + SSE live feed

### Phase 2 — Memory & AI
- Screenshot OCR, ChromaDB semantic search
- Claude summarization, RAG chat, History/Search/Settings

### Phase 3 — Production polish
- **Start minimized to tray** (configurable in Settings)
- **Startup loading screen** while sidecar and models initialize
- **Dark / light / system theme**
- **Global shortcut** `Ctrl+Shift+R` to toggle recording
- **Tray menu** updates Start/Stop label while recording
- **Session export** (Markdown / plain text)
- **Re-summarize** and **delete** sessions from History detail
- **Screen captures** shown in session detail
- **Microphone permission guide** on capture errors

## Settings

| Setting | Description |
|---------|-------------|
| Appearance | Light / dark / system |
| Claude API key | Summaries and chat |
| Whisper model | tiny.en / base.en / small.en |
| Screenshot interval | 5s / 10s / 30s / off |
| Start minimized | Launch hidden to tray |
| Storage path | Custom data directory (restart required) |

## License

MIT
