# CLAUDE.md — WeSpR

This file is read automatically by Claude Code at session start.
It contains project-specific instructions that override Claude's defaults for this codebase.

---

## Project summary

**WeSpR** — macOS transcription app. Local-only, whisper.cpp-powered, Electron + React + TypeScript.
No cloud, no account. Ships as a self-contained `.dmg` (universal binary arm64 + x64).

Read `AGENTS.md` for the full architecture reference. This file adds Claude-specific working rules.

---

## How to work in this codebase

### Before writing any code
1. Read `AGENTS.md` in full if you haven't in this session.
2. Check `git status` — understand what's already changed before adding more.
3. If the task touches the IPC boundary, open `electron/preload.ts` and `src/` side-by-side before editing either.

### Git — do this automatically
Every logical change gets its own commit. Do not batch unrelated changes.
Use conventional commit format without asking:
```
feat(dropzone): add hover glow animation
fix(merger): correct timestamp offset for chunk n>0
chore(deps): upgrade electron to 29.4.0
```

After completing a task, always run:
```bash
git add -p          # stage hunks interactively — never git add .
git commit -m "..."
```

When a feature is complete, open a PR to `main`:
```bash
gh pr create --title "feat: ..." --body "..." --web
```
The repo is **public** on GitHub. PR descriptions are public — write them clearly.

### Do not ask for permission to
- Create a feature branch before starting work
- Write a conventional commit message
- Run `git add -p` before committing
- Open `AGENTS.md` or `electron/preload.ts` to check the IPC contract
- Add a token to `tokens.css` if a new design value is genuinely needed

### Do ask before
- Changing the IPC interface in a breaking way (removing or renaming existing channels)
- Restructuring the `electron/` or `src/` directory layout
- Adding a new npm dependency
- Changing `electron-builder.yml`
- Publishing a GitHub release or pushing a tag

---

## Design system — Claude-specific reminders

The design tokens are in `src/styles/tokens.css`. They come from Claude Design (Anthropic Labs).

When writing any styled JSX:
- `var(--bg-0)` through `var(--bg-inset)` for backgrounds
- `var(--text-primary/secondary/tertiary/disabled)` for text
- `var(--violet-500)` for primary actions, `var(--violet-400)` on hover
- `var(--success/warning/danger/info)` for state colors — not violet
- `var(--font-sans)` for UI, `var(--font-mono)` for timestamps/metrics/numbers
- `var(--r-md)` (8px) for inputs/buttons, `var(--r-lg)` (12px) for cards
- `var(--shadow-lg)` for modals, `var(--shadow-md)` for elevated cards

If you're about to write `color: #` or `background: #` anywhere outside `tokens.css`, stop and use a variable instead.

---

## IPC contract — memorize this

The renderer talks to main exclusively through `window.wespr.*` (defined in `electron/preload.ts`).

Key channels:
| Method | Direction | Purpose |
|--------|-----------|---------|
| `wespr.transcribe(opts)` | R → M | Start pipeline |
| `wespr.onProgress(cb)` | M → R | Progress events (step, pct, eta, message) |
| `wespr.onResult(cb)` | M → R | Final TranscriptResult |
| `wespr.onError(cb)` | M → R | Error with step + stderr |
| `wespr.cancelTranscribe()` | R → M | Kill spawned processes |
| `wespr.listModels()` | R → M | Returns Model[] |
| `wespr.downloadModel(id)` | R → M | Starts HF download |
| `wespr.onDownloadProgress(cb)` | M → R | bytes, speed, eta per model |

Never call `ipcRenderer.invoke` or `ipcRenderer.on` directly from React components.
All IPC wiring lives in `electron/preload.ts` and `electron/ipc/`.

---

## Transcription pipeline — critical correctness requirements

Chunk offset = `n × 53s` (not `n × 55s` — account for the 2s overlap).
Deduplication at chunk boundaries: compare last 3 tokens of chunk n with first 3 of chunk n+1.
Always delete `/tmp/wespr-{jobId}/` after merge — success or failure.
On failure: log full stderr to `~/Library/Logs/WeSpR/wespr.log`, emit `transcribe:error` IPC event.

---

## UI copy rules

All strings shown to the user are in **French**. Warm, non-technical tone.
When generating error messages, follow this pattern:
> [What happened, plain language] — [What to do next]

Examples:
- "Le fichier semble corrompu — essayez un autre format."
- "Aucun modèle installé — ouvrez Réglages pour en télécharger un."
- "Transcription annulée. Le fichier n'a pas été modifié."

---

## Common tasks — how to do them correctly

**Add a new IPC channel**
1. Add method signature to `window.wespr` interface in `preload.ts`
2. Implement `ipcMain.handle(...)` in the relevant `electron/ipc/` file
3. Register the handler in `electron/main.ts`
4. Call from React via `window.wespr.newMethod()`

**Add a new model to the catalogue**
Edit the `MODELS` array in `electron/services/modelManager.ts` — not in the UI.

**Add a new export format**
1. Add the format key to the `SaveOptions.formats` union type in `preload.ts`
2. Implement the serializer in `electron/services/exporter.ts` (create if missing)
3. Add the `FormatRow` entry in `src/components/ExportPanel.tsx`

**Change a design token**
Only in `src/styles/tokens.css`. Grep for hardcoded uses of the old value after changing.