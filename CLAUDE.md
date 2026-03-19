# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev       # Start dev server at http://localhost:8080 (auto-opens browser)
bun run build     # Production build: lint → tsc → vite bundle
bun run lint      # Run ESLint
```

No test framework is configured.

## Architecture

This is a **PixiJS v8** web application written in TypeScript, bundled with Vite.

**Entry point**: `src/main.ts` — initializes a `PIXI.Application`, attaches it to `#pixi-container` in `index.html`, loads assets via `PIXI.Assets`, and uses `app.ticker` for the animation loop.

**Rendering**: All rendering goes through PixiJS. Display objects (sprites, containers, graphics) are added to `app.stage`. The ticker drives per-frame updates.

**Assets**: Static assets live in `public/assets/` and are loaded at runtime via `PIXI.Assets.load()`.

**TypeScript config**: Strict mode, ES2020 target, `isolatedModules`, `noEmit` (Vite handles transpilation).
