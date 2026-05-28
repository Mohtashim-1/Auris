# Auris

**Auris** is a desktop AI listening assistant that runs locally on your machine. It continuously transcribes microphone audio with Whisper, captures screenshots and reads on-screen text with OCR, stores everything in SQLite and ChromaDB, and lets you search your history and chat with Claude about what you heard and saw.

Built with **Tauri v2** (Rust shell), **React + TypeScript** (UI), and a **Python FastAPI sidecar** (audio, ML, database).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running the app](#running-the-app)
- [Using Auris](#using-auris)
- [Settings](#settings)
- [Keyboard shortcuts & tray](#keyboard-shortcuts--tray)
- [Data storage](#data-storage)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Privacy & security](#privacy--security)
- [License](#license)

---

## Features

### Core

| Feature | Description |
|--------|-------------|
| **Live transcription** | Microphone → WebRTC VAD → Whisper (`faster-whisper`) → real-time lines on **Today** via SSE |
| **Screen capture + OCR** | Screenshots on speech and/or timer; Tesseract extracts text for AI tasks |
| **Sessions** | Each recording is a session with start/end time, transcript, captures, summary |
| **Semantic search** | ChromaDB + `sentence-transformers` (`all-MiniLM-L6-v2`) over transcript text |
| **AI summaries** | Claude generates title, summary, and action items (speech + screen context) |
| **Ask Auris** | RAG chat over your transcript history with citations |
| **Export** | Download session as Markdown or plain text (transcript-focused) |

### UI pages

| Page | Purpose |
|------|---------|
| **Today** | Start/stop listening, live transcript, audio level meter, screenshot counter |
| **Dashboard** | Stats: sessions, lines, captures, open tasks, duration, storage, vectors |
| **Tasks** | All action items across sessions; filter Open / All / Done; jump to session |
| **History** | Past sessions; filter by title/summary; detail view with summary, tasks, screenshots, transcript |
| **Search** | Natural-language search over transcripts |
| **Ask Auris** | Chat with Claude using your stored context |
| **Settings** | API key, models, OCR, theme, storage, retention, data purge |

### Desktop integration

- System tray (Open / Start·Stop recording / Quit)
- Global shortcut **Ctrl+Shift+R** to toggle recording
- Desktop notifications when a summary is ready
- Optional start minimized to tray
- Optional auto-record on launch
- Dark / light / system theme
- First-run onboarding wizard

### Screenshots

- Modes: **Speech + timer** (default), **When you speak**, **On a timer only**, **Off**
- PNG images saved under `~/.auris/data/captures/<session-id>/`
- OCR text stored in SQLite
- View in **History → session → Screenshots** (image + extracted text)
- Counter on **Today** while recording (`Screenshots this session: N`)

### Action items

- Generated after you **stop** recording (requires Claude API key)
- Shown per session in **History** and globally in **Tasks**
- Checkboxes sync to the database

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri app (Rust) — window, tray, shortcuts, spawns sidecar │
│  React UI (Vite :1420) ──HTTP/SSE──► FastAPI sidecar :9847  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   audio.py              transcribe.py           ocr.py
   PyAudio + VAD         faster-whisper          mss + Tesseract
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    database.py (SQLite)
                    embeddings.py (ChromaDB)
                    ai.py (Anthropic Claude)
```

- **Sidecar port:** `9847` (fixed)
- **Dev frontend:** `http://localhost:1420`
- **API version:** `4` (frontend checks `MIN_API_VERSION`; stale sidecar shows a restart prompt)

---

## Requirements

### System (Linux)

```bash
# Audio
sudo apt install portaudio19-dev

# OCR
sudo apt install tesseract-ocr

# Build Tauri (if not already installed)
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Runtime

- **Node.js** 18+ and **npm**
- **Rust** toolchain (for `cargo tauri`)
- **Python** 3.10+

### Optional

- **NVIDIA GPU** — Whisper can use CUDA if PyTorch detects a compatible driver (falls back to CPU)
- **Claude API key** — required for summaries, action items, and Ask Auris (transcription works without it)

---

## Installation

```bash
git clone https://github.com/Mohtashim-1/Auris.git
cd Auris

# Python sidecar
cd sidecar
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Frontend + Tauri
npm install
```

First run downloads Whisper and embedding models (can take several minutes).

---

## Running the app

### Recommended (full desktop app)

```bash
npm run tauri dev
```

Tauri starts Vite on port **1420**, spawns the Python sidecar on **9847**, and opens the Auris window.

### Sidecar only (browser UI)

```bash
# Terminal 1
npm run sidecar
# or: cd sidecar && source .venv/bin/activate && python main.py

# Terminal 2
npm run dev
```

Open **http://localhost:1420** in a browser. Tray shortcuts and some Tauri APIs are unavailable in browser-only mode.

### Production build

```bash
npm run tauri build
```

Installers/binaries are produced under `src-tauri/target/release/bundle/`.

### Clean restart (when ports or shortcuts stick)

```bash
pkill -f 'target/debug/auris' 2>/dev/null
fuser -k 1420/tcp 9847/tcp 2>/dev/null
npm run tauri dev
```

Run **only one** `tauri dev` at a time. Stop the previous session with **Ctrl+C** before starting another.

---

## Using Auris

### Record a session

1. Open **Today** and click **Start listening** (or press **Ctrl+Shift+R**).
2. Speak — transcript lines appear live.
3. Screenshots run in the background (see counter on Today).
4. Click **Stop listening**.
5. If an API key is set, summarization runs in the background; you get a notification when done.

### View screenshots

1. **History** → open the session.
2. Scroll to **Screenshots** — PNG preview + OCR text.
3. Older sessions (before image saving was added) may show OCR text only.

### Tasks

- **Tasks** page lists action items from all sessions.
- Per-session items also appear in **History → session detail**.

### Search & chat

- **Search** — type a query; results include session title and date.
- **Ask Auris** — conversational Q&A over embedded transcripts (needs API key).

### Export

- **History → session** → **Export MD** or **Export TXT** (transcript-focused export).

---

## Settings

| Setting | Description |
|---------|-------------|
| **Claude API key** | Stored locally in SQLite; required for AI features |
| **Whisper model** | `tiny.en`, `base.en` (default), `small.en` |
| **Screenshot mode** | Speech + timer (default), speech only, timer only, off |
| **Screenshot interval** | 5 / 10 / 30 seconds (when timer mode is active) |
| **Theme** | System, light, dark |
| **Start minimized** | Launch to system tray |
| **Auto-record on launch** | Start listening when app opens |
| **Storage path** | Custom data directory (default `~/.auris/data`) |
| **Retention** | Purge sessions older than N days |
| **Delete all data** | Removes all sessions, vectors, and capture images |

Click **Save** after changing settings.

---

## Keyboard shortcuts & tray

| Action | Shortcut / location |
|--------|---------------------|
| Toggle recording | **Ctrl+Shift+R** |
| Open app | Tray → **Open Auris** |
| Start / stop recording | Tray → **Start recording** / **Stop recording** |
| Quit | Tray → **Quit** |

Closing the window hides to tray (does not quit). Use **Quit** from the tray to exit fully.

---

## Data storage

Default location: `~/.auris/`

```
~/.auris/
├── data/
│   ├── auris.db              # SQLite: sessions, transcript, captures, settings, action items
│   ├── chunks/               # Temporary WAV chunks for Whisper
│   ├── captures/
│   │   └── <session-id>/
│   │       └── <capture-id>.png
│   └── chroma/               # ChromaDB vector store
└── logs/
    └── sidecar.log           # Python sidecar logs
```

### Database tables

- `sessions` — id, started_at, ended_at, title, summary, duration_seconds
- `transcript_lines` — id, session_id, speaker, text, started_at, confidence
- `screen_captures` — id, session_id, ocr_text, captured_at
- `action_items` — id, session_id, text, done, created_at
- `settings` — key/value store

---

## API reference

Base URL: `http://127.0.0.1:9847`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/status` | Recording state, models, API key, OCR status, audio level |
| GET | `/stats` | Dashboard statistics |
| POST | `/recording/start` | Start new session |
| POST | `/recording/stop` | Stop recording, trigger summarization |
| GET | `/stream` | SSE: `transcript`, `screenshot`, `summary_ready` |
| GET | `/sessions` | List sessions |
| GET | `/sessions/{id}` | Session detail + transcript + action items + captures |
| PATCH | `/sessions/{id}` | Rename session (`title`) |
| DELETE | `/sessions/{id}` | Delete session |
| POST | `/sessions/{id}/summarize` | Re-run Claude summary |
| GET | `/sessions/{id}/export?format=md\|txt` | Download export |
| GET | `/sessions/{id}/captures/{capture_id}/image` | PNG screenshot |
| GET | `/action-items?open_only=true\|false` | All action items |
| PATCH | `/action-items/{id}` | Toggle done (`{"done": true}`) |
| GET | `/search?q=...&n=10` | Semantic search |
| POST | `/chat` | Streaming RAG chat (SSE) |
| GET | `/settings` | Read settings |
| POST | `/settings` | Save settings (`{"settings": {...}}`) |
| POST | `/data/purge` | `{"mode":"retention","days":30}` or `{"mode":"all"}` |
| POST | `/models/retry` | Reload Whisper + embeddings |

---

## Project structure

```
auris/
├── index.html              # Vite entry, favicon
├── public/                 # Static assets (auris.svg favicon)
├── src/                    # React frontend
│   ├── App.tsx             # Routing, SSE, recording state
│   ├── components/         # Sidebar, transcript line, meters, onboarding
│   ├── lib/                # api.ts, tauri.ts, theme.ts
│   └── pages/              # Today, Dashboard, Tasks, History, Search, Ask, Settings
├── src-tauri/              # Tauri Rust shell
│   ├── src/lib.rs          # Sidecar spawn, tray, shortcuts
│   ├── tauri.conf.json
│   └── icons/              # App icons
└── sidecar/                # Python backend
    ├── main.py             # FastAPI app
    ├── audio.py            # Mic + VAD
    ├── transcribe.py       # Whisper worker
    ├── ocr.py              # Screenshots + Tesseract
    ├── database.py         # SQLite
    ├── embeddings.py       # ChromaDB
    ├── ai.py               # Claude summarize + chat
    ├── export.py           # MD/TXT export
    └── requirements.txt
```

### npm scripts

| Script | Command |
|--------|---------|
| `npm run dev` | Vite dev server (:1420) |
| `npm run build` | Production frontend build |
| `npm run tauri dev` | Desktop app + sidecar |
| `npm run tauri build` | Release bundle |
| `npm run sidecar` | Python backend only |

---

## Development

### Tech stack

| Layer | Stack |
|-------|--------|
| Desktop | Tauri 2, Rust |
| UI | React 19, TypeScript, Tailwind CSS 3, Vite 7 |
| Backend | FastAPI, Uvicorn |
| Speech | faster-whisper, webrtcvad, PyAudio |
| Vision | mss, Pillow, pytesseract |
| Memory | sentence-transformers, ChromaDB |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |

### Brand colors

- Primary: `#0C447C`
- Accent: `#1D9E75`

### After pulling updates

If new API routes 404 or the UI shows “Sidecar needs a restart”:

```bash
fuser -k 9847/tcp
npm run tauri dev
```

Ensure `status.api_version >= 4` in the frontend (`MIN_API_VERSION` in `src/lib/api.ts`).

---

## Troubleshooting

### Port 1420 already in use

Another Vite instance is running:

```bash
fuser -k 1420/tcp
npm run tauri dev
```

### Port 9847 / sidecar connection refused

- Start via `npm run tauri dev` (auto-spawns sidecar), or run `npm run sidecar` separately.
- Kill stale sidecar: `fuser -k 9847/tcp`

### HotKey already registered (Ctrl+Shift+R)

A zombie Auris process holds the shortcut:

```bash
pkill -f 'target/debug/auris'
npm run tauri dev
```

### Features 404 (export, summarize, Tasks API)

Stale sidecar without new routes — restart on port 9847.

### Screenshots stay at 0

1. Install Tesseract: `sudo apt install tesseract-ocr`
2. Settings → Screenshots → not **Off** (use **Speech + timer**)
3. Check Today for “Screenshots disabled: …” message
4. Inspect `~/.auris/logs/sidecar.log` for OCR errors
5. On Wayland, screen capture may need extra permissions

### No action items / summary

- Add Claude API key in **Settings** and click **Save**
- Stop recording and wait for background summarization
- Use **Re-summarize** in session detail

### Microphone errors

Install `portaudio19-dev`, check system mic permissions, see mic guide in the Today UI.

### `proxies` error with Claude

Ensure `anthropic>=0.40.0` in `sidecar/requirements.txt` and reinstall the venv.

### Browser-only dev (`localhost:1420`)

Sidecar must be running separately; tray/shortcuts/notifications may not work.

---

## Privacy & security

- **Transcription and embeddings run locally** on your machine.
- **Claude API** is used only when you configure an API key (summaries, chat). Transcript excerpts are sent to Anthropic for those features.
- **API keys** are stored in local SQLite, not committed to git.
- **Screen captures** stay on disk under your data directory unless you use cloud AI (OCR text is included in summarize/chat prompts).

---

## License

MIT
