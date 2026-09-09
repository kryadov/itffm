# Phones and tablets — implementation plan

Spec: `docs/superpowers/specs/2026-09-09-touch-and-pwa-design.md`.

Branch: current branch. TDD for every pure function; DOM wiring is checked
live in headless Chrome, the same choice as the rest of `ui/`. One commit per
task.

## Global constraints

- Nothing changes for a mouse-and-keyboard player: every touch element is
  hidden unless `touch.active`, and the desktop screenshot must look as it
  did before.
- No new runtime dependency (no PWA plugin).
- `stepPlayer` and `PlayerInput` do not change shape.

## Task 1 — stick, swipe-to-look, tap-to-pick

- New `src/game/touchControls.ts`: pure `joystickVector(dx, dy, radius)`,
  `isTap(dx, dy, durationMs)`, `screenToNdc(x, y, w, h)`; `createTouchControls
  (dom, sensitivity): TouchControls` with `active` (from `matchMedia
  ('(pointer: coarse)')`), `read(dt)`, `setSensitivity`, `consumeTap()`
  (the NDC point of a tap since the last call, cleared on read — edge
  triggered like the jump key) and `dispose()`; every method is a no-op when
  not active, so `main.ts` builds it unconditionally. Pointer events split by screen half;
  the stick draws a ring and knob while held.
- `src/game/pick.ts`: `nearestInView(..., point = new THREE.Vector2(0, 0))`.
- `src/game/controls.ts`: skip `requestPointerLock()` on a coarse pointer;
  `.catch()` the promise everywhere.
- `main.ts`: prefer `touch.read()` while active; a tap runs the same pick
  path as `E` at the tap's NDC point.
- Tests: `test/game/touchControls.test.ts` (the three pure functions);
  `test/game/pick.test.ts` — an off-centre screen point (touch tap): nothing
  at centre, found at its own point.

Commit: `feat: touch controls — stick, swipe to look, tap on a find`

## Task 2 — on-screen buttons

- New `src/ui/cornerButtons.ts`: `CORNER_EDGE` 16, `CORNER_SIZE` 32,
  `CORNER_GAP` 8, `cornerRight(i)`.
- `src/ui/hud.ts`: a third parameter `TouchButtons` — encyclopedia and basket
  buttons at `cornerRight(1)`/`cornerRight(2)`, hidden by default.
- `src/game/touchControls.ts`: a crouch button at bottom-centre that sets the
  closure's `crouching` while held (`touch-action: none` on the button).
- `main.ts`: show the buttons when `touch.active`; wire them to the same
  functions as `Tab` and `Q`.
- Test (`test/ui/cornerButtons.test.ts`): first button flush against the edge;
  each next one width-plus-gap further in; adjacent buttons never overlap;
  monotonically inward.
- Look at it: desktop screenshot (only the gear) and a mobile-emulated one
  (three corner buttons and crouch).

Commit: `feat: on-screen buttons for touch — encyclopedia, basket, crouch`

## Task 3 — portrait layout

- New `src/ui/responsiveStyle.ts`: `ensureStyleOnce(id, css)`.
- `src/ui/inspect.ts`: under `@media (max-aspect-ratio: 4/5)`, `#inspect`
  switches to `flex-direction: column`, model ~40 vh, card scrolls.
  `src/ui/encyclopedia.ts`: narrower paddings (34/38 → 16/14 px); its
  `auto-fill` grid already reflows to one column.
- Look at it: 390×844 viewport, encyclopedia and a species card (a temporary
  `?inspectDemo=1` hook opening `openInspect` directly, removed before the
  commit).

Commit: `feat: portrait layout for the encyclopedia and the species card`

## Task 4 — offline launch and home-screen install

- New `public/manifest.webmanifest` (name, colours, `display: standalone`,
  the SVG icon with `sizes: "any"`); `index.html` links it.
- New `public/sw.js`: `install` — fetch `./index.html`, regex its
  `./assets/...` `src`/`href` values, `cache.addAll` `./`, `./index.html`, the
  manifest and the icon first, then fetch and `cache.put` each asset; `activate` — drop old caches, `clients.claim()`; `fetch` —
  same-origin GETs stale-while-revalidate.
- `main.ts`: when `serviceWorker` is supported, register `sw.js` on `load`,
  swallowing a refusal.
- Look at it: build, serve `dist/`, visit once online, then
  `Network.emulateNetworkConditions({offline: true})` and reload —
  `window.__READY` must become true with zero network requests. (A first
  attempt with passive fetch-time caching should be expected to fail this
  check — that is why the precache exists.)

Commit: `feat: PWA — offline launch and a home-screen icon`

## Checkpoint

`npm test`, `npm run build`, `npm run boot-check`. Push, then open the live
site on a real phone: walk, look, tap a mushroom, open the encyclopedia, put
the phone in airplane mode and reload.
