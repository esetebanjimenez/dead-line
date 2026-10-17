# Dead Line

Browser lane-defense game (zombies vs. modern military). TypeScript, Vite, PixiJS v8. Hosted on GitHub Pages.

- `pnpm dev` runs the dev server, `pnpm test` runs simulation tests, `pnpm build` validates data, type-checks and builds.
- `pnpm sim` runs the headless balance bot.
- Layout: `src/sim` (deterministic, no rendering), `src/render` (Pixi), `src/ui` (DOM HUD), `src/data` (tunable tables), `src/meta`, `src/input`, `tools`, `tests`.
- Rule: `sim` never imports from `render` or `ui`. All tunable values live in `src/data`.
