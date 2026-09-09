# Phones and tablets: touch controls, portrait layout, offline install — design

Date: 2026-09-09
Status: approved, in implementation.
Builds on: `docs/superpowers/specs/2026-09-07-mushroom-game-design.md` (which
left mobile for "after real geography" — real geography is done).

## 0. Why

The game is unplayable on a phone. Everything runs on a keyboard and Pointer
Lock, neither of which exists there; the encyclopedia and the species card are
laid out for a landscape monitor; and the one thing a phone is good at in a
wood — working with no signal — the game cannot do at all.

## 1. Decisions

| Decision | Why |
|---|---|
| A new module, `game/touchControls.ts`, not a port | `race-the-city`'s touch controls are gas/brake/steering buttons for a car. A walk in the woods needs a stick, a swipe and a tap, none of which existed there. Only the technique is taken: pointer events and `pointer:coarse` detection. The donor's genre decides what it can give, just as its buildings and carriageways do in `geo/`. |
| `createTouchControls(dom, sensitivity)` returns the same `read(dt): PlayerInput` as `createControls` | `stepPlayer` learns nothing new. `main.ts` prefers `touch.read()` while `touch.active`. |
| Left half of the screen is the stick, right half is the look | Thumbs fall there. The stick's offset gives `forward`/`strafe` with the WASD convention; the look gives `dYaw`/`dPitch` from `clientX/Y` deltas between frames, since there is no `movementX` without Pointer Lock. |
| A short touch on the right half with little movement (`isTap`: under `TAP_MOVE_THRESHOLD` 12 px and `TAP_TIME_THRESHOLD` 350 ms) is a tap, and a tap aims at **its own screen point** | `game/pick.ts`'s `nearestInView` gains an optional `point` (default: screen centre). A finger points at the mushroom, not at an invisible crosshair. |
| The stick draws its own ring and knob while a finger is on it | Otherwise the left half is controllable only by feel. |
| No Pointer Lock on a coarse pointer, and every request gets a `.catch()` | Every tap threw an unhandled `NotAllowedError` into the console. The catch also covers a desktop browser refusing. |
| On-screen buttons for encyclopedia and basket in the same top-right row as the settings gear (`ui/cornerButtons.ts`'s `cornerRight(i)`, 32 px buttons, 8 px gap, 16 px edge) | The geometry is ported from `race-the-city` and fitted to the gear that already exists, not the donor's 44 px. Hidden unless `touch.active`. |
| Crouch is a button at bottom-centre inside `touchControls.ts`, not in the corner row | It is a hold, not a one-shot action, and it writes the same `crouching` field `read()` already returns. |
| Portrait layout is a vertical stack, not tabs: the model on top (~40 vh), the card below with its own scroll | Tabs would hide the 3D model while reading — and examining the specimen up close is the point. A stack needs no JS state. |
| `@media` rules are injected once by `ui/responsiveStyle.ts`'s `ensureStyleOnce(id, css)` | The UI styles everything inline, and `@media` cannot be inline. One `<style>` tag, inserted on first open, never duplicated. `!important` overrides the panels' own inline flex rather than threading an "is phone" flag through the code. |
| PWA with no plugin: `public/manifest.webmanifest` (the SVG favicon as an icon, `sizes: "any"`) and a hand-written `public/sw.js` | Runtime stays `three` + `yaml`; a build plugin is a dependency like any other. |
| The service worker **precaches actively in `install`**: fetch `./index.html`, read its `./assets/...` script and link URLs out of it, cache them all | Caching passively on fetch does not work for the first visit: a newly registered worker does not control the page that registered it until install+activate finish, by which time `index.html` and the hashed bundle have already gone over the network. `clients.claim()` only catches what is still in flight. Reading the asset names from `index.html` avoids hard-coding hashes. |
| After precache, `fetch` is stale-while-revalidate | A visit online refreshes the cache for next time; offline serves what is there. |

## 2. Out of scope

- A performance budget for phones (fewer segments, more aggressive culling,
  instancing mushrooms). It has to be measured on a real device, not an
  emulator.
- Touch for anything that has its own key and no button yet.

## 3. Testing

- Pure: `joystickVector` (neutral at origin, up is forward, right is strafe,
  clamped at the radius, smooth inside it, both components on a diagonal),
  `isTap` (tap, drifted, held), `screenToNdc` (centre, corners — NDC y grows
  up, screen y down), `cornerRight` (first flush to the edge, each next one
  width-plus-gap in, no overlap, monotonic).
- `game/pick.ts`: nothing at screen centre for an off-centre object; found
  once the ray aims at its own screen point.
- Live, headless Chrome over CDP: touch emulation confirms `pointer:coarse`
  is detected, a left-half touch is classified as stick, a right-half tap as
  a tap; a portrait 390×844 screenshot of the encyclopedia and a species
  card; `Network.emulateNetworkConditions({offline: true})` plus a reload
  reaches `window.__READY` with no network request. (CDP's synthetic touches
  sometimes fire a `pointercancel` after ~100 ms — an artefact of emulation,
  so log inside the handlers rather than trusting one frame.)
