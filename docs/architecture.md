# Starfall Salvage — Revised Weekend Plan & API Contract (v3)

## Context
Repo today (main, clean): empty scaffold. `index.html`, `styles.css`, `src/main.js` are 0 bytes; `test/`, `scripts/`, `.github/workflows/` hold only `.gitkeep`; README is a one-line title; LICENSE is MIT (done); `package.json` has `"type":"module"`, `test` = `node --test`, `stress` = `node scripts/stress-test.js`, no deps; Node 24 locally. Remote: `chongkeatL/starfall-salvage`. Nothing to reuse, so we design from scratch.

Goal: ship v1.0.0 of a Canvas 2D shooter that is deterministic and testable, with a clean Engine/UI split, and with real evidence from four Claude Code workflow exercises. A human merges PRs, tags, and releases (CLAUDE.md).

Decisions (confirmed): `package.json` is shared (one edit in setup, none afterwards). World 960×540 logical at fixed 60 Hz. Contract doc is `docs/architecture.md`. Node matrix 22 and 24, `engines` `>=22`.

## Design principles
- Engine is pure, reducer-style: `update(state, input, dt)` mutates only the state it owns and returns events. No DOM, Canvas, `localStorage`, `Date`, or `Math.random`.
- **Fixed timestep** (`DT = 1/60`). `main.js` accumulates real time and calls `update` N times. Tests call it with `DT`, so time is fully controllable.
- **RNG is injected** (mulberry32). RNG state lives in `state.rng`, so a run is a pure function of (seed, input sequence).
- Render reads state and never writes it. Interpolation and shake are render-local.
- Events are plain data consumed by UI. The engine never calls UI.

## v1.0.0 scope
Core: player ship, bullets, **asteroids (split on death) and drones (chase and ram)**, salvage drops and pickup, collisions, score, escalating waves, ready/pause/restart/game-over, best score, keyboard and touch. Everything else is in **Stretch**.

## State shape (`src/game.js`)
```js
{
  seed: 12345,
  rng: { s: <uint32> },                 // owned by rng.js
  time: 0,                              // seconds simulated
  mode: 'ready' | 'playing' | 'paused' | 'gameover',
  world: { w: 960, h: 540 },
  player: { x, y, vx, vy, r, hp, maxHp, cooldown, invuln },
  bullets: [{ id, x, y, vx, vy, r, ttl }],
  enemies: [{ id, kind: 'asteroid'|'drone', x, y, vx, vy, r, hp, size }],  // size 3|2|1 for asteroids
  salvage: [{ id, x, y, vx, vy, r, ttl, value }],
  score: 0, salvaged: 0,
  wave: { n: 1, toSpawn: 0, spawnTimer: 0, clearTimer: 0 },
  nextId: 1,
  events: []                            // reset at the start of each update
}
```
**Mode transitions**
```
createGame        → ready
ready    --start--> playing        (run begins, wave 1)
playing  --pause--> paused --pause--> playing
playing  --hp<=0--> gameover
paused | gameover --restart--> ready   (initial state: fresh entities, score 0, time 0)
playing  --restart--> ready
```
`restart()` always returns to `ready` with a clean initial state; `start` is the only way into `playing` from `ready`. In `ready`, `paused`, and `gameover`, `update` advances neither `time` nor entities. Best score is **not** in engine state; UI compares `state.score` on the `gameOver` event with storage.

## Function signatures

### `src/rng.js`
```js
makeRngState(seed): { s }
nextFloat(rng): number          // [0,1), mutates rng.s
nextInt(rng, min, max): number  // inclusive
pick(rng, arr): any
```

### `src/collision.js`
```js
circlesOverlap(a, b): boolean               // {x,y,r}
findCollisions(listA, listB): Array<[a, b]> // O(n*m); fine at our scale
clampToWorld(entity, world, margin?): void
```

### `src/entities.js`
```js
CONFIG                                      // speeds, radii, cooldowns, caps, wave table, DT
createPlayer(world): Player
createBullet(id, from, angle): Bullet
createAsteroid(id, rng, world, size): Enemy
createDrone(id, rng, world): Enemy          // arrives in Exercise 4 (Engine)
createSalvage(id, x, y, value): Salvage     // arrives in Exercise 4 (Engine)
splitAsteroid(enemy, rng, nextId): Enemy[]  // arrives in Exercise 4 (Engine)
```

### `src/game.js`
```js
createGame({ seed, world? }): GameState       // mode 'ready'
update(state, input, dt): GameEvent[]         // mutates state; returns state.events
restart(state, seed?): void                   // resets in place to initial 'ready' state
// input = { moveX: -1..1, moveY: -1..1, fire: bool,
//           start: bool (edge), pause: bool (edge), restart: bool (edge) }
// pipeline, each exported for unit tests:
stepPlayer, stepBullets, stepEnemies, resolveCollisions, stepSalvage, stepWaves, checkGameOver
```
`update` order: mode edges (`start`/`pause`/`restart`) → if not `playing`, return → player → fire → bullets → enemies → collisions → salvage → waves → game-over check.

### Events
```
{type:'started'} {type:'paused'} {type:'resumed'} {type:'reset'} {type:'shot'}
{type:'enemyHit', id} {type:'enemyKilled', id, kind, x, y}
{type:'salvagePickup', value} {type:'playerHit', hp}
{type:'waveStart', n} {type:'waveClear', n} {type:'gameOver', score, wave}
```

### UI modules
```js
createInput(target, touchEl?): { poll(): InputActions, dispose(): void }   // poll() clears edge flags
loadBest(storage = globalThis.localStorage): number                         // 0 on failure/garbage
saveBest(score, storage?): boolean                                          // writes only if higher; false if blocked
createRenderer(canvas): { resize(), draw(state, { best, alpha, fx }) }
```
Keyboard: arrows/WASD move, Space fire, Space/Enter start (from ready), P/Esc pause, R restart. Touch (Exercise 2): left-zone stick, fire button, tap-to-start, pause/restart buttons, Pointer Events, `touch-action:none`. Storage key `starfallSalvage.best.v1`, every access in try/catch, in-memory fallback. Render: DPR, letterboxed 960×540, render-local starfield, HUD, overlays (start, paused, game-over); a test deep-freezes state and draws to a mock ctx to enforce purity. `main.js`: `acc += min(frameDt, 0.25)`, fixed-step loop, `gameOver` → `saveBest`, hidden tab → inject pause.

## Event flow
```
keyboard/touch → input.poll() → actions
actions + DT   → game.update(state) → mutates state, returns events
events         → main.js → saveBest on gameOver, UI flash
state          → render.draw(state)   (read-only)
```

## Tests and stress harness
- `scripts/stress-test.js`: `--seed N --ticks N` (defaults 12345 / 5000). Sends `start`, then drives the game with a bot using a **second** seeded RNG. Per-tick invariants: no NaN, entities in world or culled, counts under `CONFIG` caps, hp ≥ 0, score non-decreasing. Prints summary and final-state hash; exit 1 on violation; same seed gives same hash. The bot also sends `restart` after game-over to exercise the reset path.
- `node:test` suites: `rng`, `collision`, `game` (starts in `ready` and frozen until `start`; movement/clamp; fire cooldown; bullet kills obstacle; hit then invuln; hp 0 → `gameover`; pause freezes `time`; **restart from any mode returns an initial `ready` state deepEqual to `createGame` with the same seed**; replay determinism; snapshot hash), `storage` (fake and throwing storage), `render` purity.
- Never stub `Math.random` globally; CI greps for it.

## File boundaries
| Session | Owns |
|---|---|
| Engine | `src/game.js`, `src/entities.js`, `src/collision.js`, `src/rng.js`, `test/`, `scripts/` |
| UI | `index.html`, `styles.css`, `src/main.js`, `src/render.js`, `src/input.js`, `src/storage.js` |
| Shared (ask first, one editor at a time) | `package.json`, `CLAUDE.md`, `docs/` (incl. `architecture.md`, `evidence.md`), `.github/`, `README.md` |

## Git rules for every phase
One feature branch and one PR per task; a human reviews and merges each PR. Never commit to main; never force-push, `reset --hard`, or `clean -fd`; **never rebase a pushed branch, merge main into it instead**; no tag or release by Claude. Pushes and PR creation happen only with your go-ahead.

## Phases and time estimates (total ≈ 14–18 h)

### Phase 1 — Bootstrap / setup · 1–1.5 h · `chore/setup`
Shared files, one session, one PR:
- `docs/architecture.md` (this contract).
- `docs/evidence.md`: a checklist per exercise with fields **session link, branch, PR URL, CI run URL, screenshot path, notes, outcome (done / blocked / incomplete)**. No secrets, tokens, or personal data, and links only.
- One `package.json` edit: description and `"engines": {"node": ">=22"}`.
- One line added to `CLAUDE.md` (Git safety): "Never rebase a branch that has been pushed; merge main into it instead."
- README skeleton.

### Phase 2a — Engine slice · 2–2.25 h · `feat/engine-slice`
`rng`, `collision`, `entities` (player, bullet, one asteroid type without splitting), `game`: ship, movement, fire, **one obstacle**, collision, score, `ready`→`playing`→`gameover`, `restart()` → `ready`. Minimal tests: rng determinism, circle collision, fire cooldown, bullet hits obstacle, hp 0 → game-over, `restart()` returns to initial `ready`, `ready` stays frozen. One PR.

### Phase 2b — UI slice · 1.5–2 h · `feat/ui-slice` (after 2a merges)
`index.html`, canvas + `styles.css`, keyboard `input.js`, `render.js` (ship, obstacle, bullets, HUD, start/game-over overlays), `main.js` fixed-step loop, `storage.js`. Playable by keyboard in a browser via a static server (no new dependencies). One PR.

### Phase 3 — Deterministic tests + stress harness + CI · 2–2.5 h · `test/deterministic-suite`
Full suites above, `scripts/stress-test.js`, `.github/workflows/ci.yml` (matrix **Node 22 and 24**: checkout, setup-node, `npm test`, `npm run stress -- --seed 12345 --ticks 5000`, `Math.random` guard grep). Green CI on the PR.

### Phase 4 — Four workflow exercises · ≈ 6.5–8 h total
Each is recorded in `docs/evidence.md`. Reviews of every PR by you are part of the exercise and are never skipped.

**Exercise 1 — Unattended cloud task on tests/stress · 1–1.5 h active (plus wait) · `test/cloud-hardening`**
Run as a **cloud session or scheduled task that keeps running with your laptop closed**. It produces a branch and a PR, and has **no merge permission**. Brief: hunt for a real defect by writing a failing test or invariant (edge cases in collision, restart, pause, stress seeds), then fix it only with the test kept, or **honestly report that none was found**, and add any extra seeds to the stress run. It may not weaken or delete existing tests. Evidence: session/task link, PR URL, the failing-test output (or the "no defect found" report), CI run.

**Exercise 2 — Mobile-steered touch controls · 1.5–2 h · `feat/touch-controls`**
Must be a **cloud Claude Code session opened in the Claude mobile app**. Remote Control does **not** count, because it runs on your computer. If cloud/mobile isn't available, the exercise is marked **blocked and incomplete** in `docs/evidence.md`, and I will not substitute a local run. Scope (UI-owned files): virtual stick, fire button, tap-to-start, pause/restart buttons, `touch-action:none`. Acceptance: phone-width viewport plus a real device; screenshot in evidence.

**Exercise 3 — Deliberate CI failure, then Pages + release rehearsal · 1.5–1.75 h**
- 3a (`ci/deliberate-failure`, throwaway, never merged): push a branch with a deliberately broken assertion. Claude must **first read the failing CI logs (e.g. `gh run view --log-failed`) and explain the failure, then wait for your approval before fixing**. After approval it fixes (or discards the branch). Evidence: failing and fixed run URLs.
- 3b (`ci/pages`): add `.github/workflows/pages.yml` (upload-pages-artifact + deploy-pages, relative URLs). You enable Pages in repo settings; verify the live URL.
- 3c: draft release notes and a release checklist only; you tag and publish.

**Exercise 4 — Two concurrent cloud sessions, Engine vs UI · 2–2.5 h**
Two **cloud sessions running at the same time**, on separate branches and **separate PRs**, with strict file ownership:
- Engine session on `feat/engine-depth` (owns `src/game.js`, `entities.js`, `collision.js`, `rng.js`, `test/`, `scripts/`): drones, salvage, asteroid splitting, wave escalation, tests and stress extended.
- UI session on `feat/ui-depth` (owns `index.html`, `styles.css`, `src/main.js`, `render.js`, `input.js`, `storage.js`): rendering for drones/salvage per `docs/architecture.md`, wave HUD, overlays, resize.
- Neither touches shared files or the other's files; contract questions go to you.
- Merge order: you review and merge **Engine first**; then update the UI branch by **merging main into it** (never rebase a pushed branch), re-run CI, review, and merge UI. Evidence: both session links, both PR URLs, CI runs, the main-into-UI merge commit.

### Phase 5 — Polish · 1–1.5 h · `polish/*`
Balance pass, hit flash and shake (render-local), auto-pause on hidden tab, responsive checks (360×640, 1280×720, ultrawide), accessibility basics, README (controls, architecture, determinism, screenshots drawn from the game).

### Phase 6 — Release · 0.5 h · `release/v1.0.0`
Final README/LICENSE check, CI green on 22 and 24, Pages live, QA checklist, `docs/evidence.md` complete. A **human** merges, tags `v1.0.0`, and publishes the release.

**If time slips:** drop stretch goals and polish first, never the exercise evidence or your review of each PR.

## Risks and mitigations
- **Cloud/mobile unavailable** (Ex 1, 2, 4): record as blocked/incomplete; no local substitute. Check availability early (during Phase 1) so there's time to resolve it.
- **Float drift across machines:** `+ - * /`, `sqrt`/`hypot` in state paths; same-engine determinism; snapshot hash rounds values.
- **Frame-time spikes:** cap dt at 0.25 s; auto-pause when hidden.
- **Touch UX:** per-pointer ids, real-device test.
- **Render mutating state:** frozen-state purity test.
- **Storage blocked:** guarded, in-memory fallback.
- **Pages paths:** relative URLs under `/starfall-salvage/`.
- **Parallel sessions:** disjoint ownership; `docs/architecture.md` as the only coordination point; UI renders new kinds from the contract, so unknown kinds must fall back to a generic shape.
- **Test gaming:** no weakening or deleting tests; snapshot updates need a stated reason in the PR.
- **Unattended session overreach:** cloud task has no merge permission, restricted to its branch.
- **Entity blow-up:** caps in `CONFIG`, asserted by stress.

## Acceptance checks
- `npm test` green on Node 22 and 24 in CI; no dependencies.
- `npm run stress -- --seed 12345 --ticks 5000` exits 0 with an identical hash across two runs; other seeds pass.
- `grep -rE "document|window|localStorage|Math\.random|Date" src/{game,entities,collision,rng}.js` returns nothing.
- Game opens in `ready` with a start overlay; `restart` returns to `ready`; keyboard and touch both work.
- Wave n+1 is harder than n; game-over shows score and best; best persists; blocked storage doesn't crash.
- Canvas OK at 360×640, 1280×720, ultrawide; no external art, fonts, or scripts.
- `docs/evidence.md` has a complete entry per exercise, or an explicit blocked/incomplete status.
- Pages URL loads and plays; README accurate; MIT LICENSE present; `v1.0.0` tagged and released **by a human**.

## Stretch (not in v1.0.0)
Shooter enemy and enemy bullets, combo multiplier, shield power-up, WebAudio oscillator sound, particles, boss wave, daily-seed mode.