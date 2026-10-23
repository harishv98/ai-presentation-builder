# AI Presentation Builder

Generate, refine, and edit 16:9 slide decks with an AI agent (Sarvam, tool calling) and a free-form canvas editor.

Design and roadmap: [docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md](docs/superpowers/specs/2026-10-23-ai-presentation-builder-design.md). The full README (architecture, drag-and-drop, known gaps) is written in stage 9.

## Setup

Requires Node 24+.

```bash
npm install
cp .env.example .env.local   # then set SARVAM_API_KEY
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | oxlint |
| `npm run spike [model]` | Check that a Sarvam model streams valid tool calls (uses ~1 credit) |
