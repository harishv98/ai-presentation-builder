# AI Presentation Builder

Generate, refine, and edit 16:9 slide decks with an AI agent (Sarvam, tool calling) and a free-form canvas editor.

**Live:** [ai-presentation-builder-eta.vercel.app](https://ai-presentation-builder-eta.vercel.app/)

- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers the end-to-end flow (schema → store → canvas, filmstrip, chat tools → export) and links one document per component, including [cross-slide drag-and-drop](docs/architecture/cross-slide-drag.md) and [canvas editing](docs/architecture/canvas-editing.md).
- **Known gaps:** [docs/architecture/streaming.md#known-gaps](docs/architecture/streaming.md#known-gaps). Export is print-to-PDF (no PPTX). Cross-slide drag supports both move and copy (hold Alt/Option to copy).
- **Design and roadmap:** [docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md](docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md).

## Setup

Requires Node 24+.

```bash
npm install
cp .env.example .env.local   # then set SARVAM_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `SARVAM_API_KEY` | Sarvam API key. Read only on the server; never sent to the browser. |
| `SARVAM_MODEL` | Optional. Defaults to `sarvam-105b`. |

On Vercel, set the same variables in the project's environment settings.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests |
