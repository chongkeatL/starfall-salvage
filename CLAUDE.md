# Starfall Salvage

Open-source 2D Canvas browser shooter. Vanilla JS ES modules, HTML/CSS, no framework, no backend, no paid API, no external art. Original Canvas/CSS-drawn shapes only.

## Commands
- Test: `npm test`
- Stress: `npm run stress -- --seed 12345 --ticks 5000`

## Architecture
- `src/game.js`, `src/entities.js`, `src/collision.js`, `src/rng.js`: engine rules. Must stay browser-independent (no DOM, no Canvas, no localStorage).
- `src/render.js`: drawing only. Never changes game state.
- `src/input.js`: translates keyboard/touch into actions (moveX, moveY, fire, pause, restart).
- `src/storage.js`: guarded localStorage. Must not crash if storage is blocked.
- `src/main.js`: startup, wiring, animation loop.
- Tests use Node's built-in runner, with injected seeded RNG and controllable time. Never stub `Math.random` globally.

## Style
- ES modules, small functions, clear names, comments only where intent is not obvious.
- No new dependencies without asking first.

## File ownership (for parallel sessions)
- Engine session: `src/game.js`, `src/entities.js`, `src/collision.js`, `src/rng.js`, `test/`, `scripts/`.
- UI session: `index.html`, `styles.css`, `src/main.js`, `src/render.js`, `src/input.js`, `src/storage.js`.
- Shared files (`package.json`, `CLAUDE.md`, `docs/`, `.github/`): do not edit concurrently. Ask first.

## Git safety
- Work only on a feature branch. Never commit directly to `main`.
- Never use `git push --force`, `git reset --hard`, or `git clean -fd`.
- Never merge a PR, create a tag, or publish a release. A human does that.
- Never put secrets, tokens, or personal data in files, commits, or logs.
- Do not weaken or delete a test just to make it pass.
- Never rebase a branch that has been pushed; merge main into it instead.