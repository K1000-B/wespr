# AGENTS.md — WeSpR

Instructions for AI coding agents working on this codebase.
Read this file in full before writing any code.

---

## What this project is

**WeSpR** is a macOS desktop app for local audio/video transcription powered by whisper.cpp.
No account, no cloud, no internet required at runtime. The `.dmg` is fully self-contained.

Stack: Electron 29 + React 18 + TypeScript + Vite. CSS custom properties only (no Tailwind).
State: Zustand. Animations: Framer Motion (page transitions only). IPC: contextIsolation + preload.

---

## Repository rules

### Git discipline
- **Always work on a feature branch** — never commit directly to `main`.
  ```
  git checkout -b feat/my-feature
  ```
- **Commit early and often** with conventional commits:
  ```
  feat:     new user-facing feature
  fix:      bug fix
  chore:    tooling, deps, config
  refactor: internal restructuring, no behaviour change
  docs:     README, comments, AGENTS.md
  style:    formatting only
  test:     tests
  ```
- **Never commit** binaries, models, `.dmg`, `.env`, or anything in `resources/binaries/`.
  These are gitignored. If you accidentally stage them, unstage immediately.
- Squash fixup commits before opening a PR:
  ```
  git rebase -i origin/main
  ```

### GitHub workflow
- Open a PR for every feature. Title = conventional commit format.
- PR description must include: what changed, why, how to test it manually.
- Merge strategy: **squash and merge** to keep `main` linear.
- After merging, delete the feature branch:
  ```
  gh pr merge --squash --delete-branch
  ```
- Tag releases with semver before building the `.dmg`:
  ```
  git tag -a v1.0.0 -m "Release v1.0.0"
  git push origin v1.0.0
  ```

---

## Architecture constraints — read before touching any file

### IPC boundary — strictly enforced
- **Renderer process** (React): zero Node.js access. All system calls go through `window.wespr.*`.
- **Main process** (Electron): owns ffmpeg, whisper-cli, file I/O, model downloads.
- **Preload** (`electron/preload.ts`): the only bridge. Exposes `window.wespr` via `exposeInMainWorld`.
- Adding a new capability = add a channel to preload + handler in `electron/ipc/` + type in the interface. Never call Node APIs from a React component.

### CSS design system — no exceptions
- Every color, spacing, radius, shadow must use a `var(--...)` token from `src/styles/tokens.css`.
- **Never hardcode a hex value** in a React component or CSS file.
- The token file is the single source of truth. Do not add new color variables without adding them there first.
- Font families: `var(--font-sans)` for UI, `var(--font-mono)` for timestamps and metrics.

### Binaries
- `resources/binaries/` is gitignored and populated by `scripts/build-whisper.sh` + `scripts/download-ffmpeg.sh`.
- At first launch, main process copies binaries to `~/Library/Application Support/WeSpR/bin/` and `chmod +x`.
- Detect arch with `process.arch` → use `whisper-cli-arm64` or `whisper-cli-x64` accordingly.

### Transcription pipeline — do not break the order
1. Convert input → WAV 16kHz mono (ffmpeg)
2. Split → 55s chunks, 2s overlap (ffmpeg segment)
3. Transcribe each chunk sequentially (whisper-cli --output-json)
4. Merge segments, correct timestamps offsets, deduplicate overlaps
5. Delete `/tmp/wespr-{jobId}/` — **always**, even on error (log the path if keeping for debug)

### UI copy — French only, non-technical
All user-visible strings are in French. No English jargon exposed to the user.
- ✅ "Préparation du fichier…"
- ✅ "Exécuté entièrement sur votre Mac"
- ❌ "Spawning worker process"
- ❌ "Processing audio chunks"

---

## File structure — do not reorganize

```
wespr/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/          transcribe.ts · models.ts
│   └── services/     ffmpeg.ts · whisper.ts · segmenter.ts · merger.ts · cleanup.ts · modelManager.ts
├── src/
│   ├── styles/       tokens.css · globals.css
│   ├── pages/        Home.tsx · Result.tsx · Settings.tsx
│   ├── components/   TitleBar · DropZone · OptionsPanel · ProgressPanel · TranscriptViewer · ExportPanel · ModelCard · ModelRow
│   ├── store/        transcription.ts · models.ts
│   └── lib/          utils.ts
├── scripts/          build-whisper.sh · download-ffmpeg.sh · postinstall.js
├── resources/
│   └── binaries/     (gitignored)
├── AGENTS.md         ← this file
├── CLAUDE.md         ← identical intent, Claude Code format
├── README.md
└── LICENSE
```

---

## Commands

```bash
npm run dev          # Electron + Vite dev mode
npm run build        # Compile TypeScript + bundle renderer
npm run dist         # Build .dmg (requires binaries/)
npm run postinstall  # Download ffmpeg + compile whisper-cli (first setup)
```

---

## What good looks like

- A PR that adds a feature also updates the relevant type in `preload.ts` and documents the IPC channel.
- No `any` types in IPC interfaces.
- No inline styles with hardcoded colors.
- Every user-visible error message is in French and actionable ("Aucun modèle installé — ouvrez Réglages pour en installer un.").
- Tmp files are always cleaned up. Log paths are always written to `~/Library/Logs/WeSpR/wespr.log`.
- `resources/binaries/` never appears in `git status`.