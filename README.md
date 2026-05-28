# Auris

AI-powered always-on listening assistant for desktop. Continuously transcribes microphone audio locally with Whisper, captures screen OCR, stores everything in SQLite + ChromaDB, and lets you search and chat with Claude about what was heard and seen.

## Run

```bash
cd sidecar && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd .. && npm install && npm run tauri dev
```

If features 404 after an update: `fuser -k 9847/tcp` then restart.

## Features by phase

| Phase | Highlights |
|-------|------------|
| **1** | Live Whisper transcription, SQLite, SSE, Today page |
| **2** | OCR, ChromaDB search, Claude summaries & chat, History |
| **3** | Tray, dark mode, export, shortcuts, notifications |
| **4** | Onboarding, Dashboard stats, audio meter, rename sessions, data purge, history filter |

### Phase 4 details
- **Onboarding** wizard on first launch
- **Dashboard** — sessions, storage, vectors, recording time
- **Audio level meter** while recording
- **History search** — filter by title/summary
- **Rename sessions** — click title in detail view
- **Copy transcript** to clipboard
- **Data management** — retention purge or delete all
- **Auto-record on launch** (Settings)

## Shortcuts

- `Ctrl+Shift+R` — toggle recording
- Tray menu — Open / Start·Stop / Quit

## Settings

API key, Whisper model, OCR interval, theme, tray behavior, storage path, retention, auto-record.

## License

MIT
