# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # Start dev server (localhost:3000)
npm run build     # Production build (also runs TypeScript type-checking)
npm run lint      # ESLint
```

No test framework is configured yet.

## Architecture

**System Design Chaos Simulator** — users draw system architectures on an Excalidraw canvas, and the app will spin up a live Docker environment to simulate and stress-test the design.

### Current state (frontend only)

- **Next.js 16 App Router** with React 19, Tailwind CSS v4, React Compiler enabled
- Single page (`src/app/page.tsx`): 12-column grid with Excalidraw canvas (left 8 cols), AI chat sidebar (right 4 cols), telemetry footer
- `src/components/Canvas.tsx`: Excalidraw wrapper, loaded via `next/dynamic` with `ssr: false`
- `src/components/Dashboard.tsx`: Live telemetry charts (Recharts) showing simulated latency/CPU data
- AI SDK (`ai` + `@ai-sdk/anthropic`) installed but not yet wired up

### Planned backend (not yet built)

A **FastAPI (Python)** backend will handle all LLM calls and Docker orchestration. The frontend never talks to LLMs directly.

## Key Design Rules

1. **All LLM calls and Docker orchestration happen server-side** (FastAPI backend) — never expose API keys to the client
2. **Template-driven infrastructure**: The LLM produces a JSON topology; the backend maps it to pre-tested Jinja2 Docker templates. The LLM never writes raw docker-compose files.
3. **Vision parsing**: Excalidraw canvases are exported as base64 PNGs and sent to the backend via multipart/form-data (not raw Excalidraw JSON)
4. **Container cleanup**: Always use `finally` blocks in Docker management code to prevent zombie containers

## Gotchas

- Excalidraw requires explicit CSS import (`@excalidraw/excalidraw/index.css`) — it is not bundled with the JS
- Excalidraw must be loaded client-side only (no SSR) due to browser API dependencies
- Tailwind v4 uses `@tailwindcss/postcss` plugin (not the v3 `tailwindcss` PostCSS plugin)
