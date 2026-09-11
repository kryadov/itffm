# Walking, finding your way, and the menus — design

Date: 2026-09-11
Status: approved, in implementation. Collects the movement and menu decisions
made since the playable slice, plus today's pause-menu rework.
Builds on: `game/player.ts`'s `stepPlayer`, `game/controls.ts`.

## 0. Why

The playable slice walks like a camera on a trolley: constant speed up any
slope, no jump, no sense of a body. It starts the player at world (0, 0)
whether or not a tree stands there. There is no way to tell which way is
north, no way to recall a key once the first-run screen is gone, and `Esc`
throws you straight at "leave the game?". On a phone the first-run screen
cannot even be got past.

Every decision below is the same question: what does a person walking in a
wood actually have, and what would spoil the walk?

## 1. Decisions

### The body

| Decision | Why |
|---|---|
| A steep climb slows you: `slopeFactor` reads the ground a metre ahead along the motion and scales speed down linearly from 35° to a full stop at 54° — uphill only | You can slide down a bank; you cannot run up a cliff. |
| A jump on `Space`, edge-triggered (`jumpPending`), modelled as an explicit height above ground (`PlayerState.hop`) | Key repeat would jump every frame. A height `main.ts` adds to the camera is clearer in tests than a sign on `vy`. No jump while crouched, no double jump. |
| A camera bob from distance actually walked (`bobPhase`), not time: a lift twice per cycle (one per foot) and a softer sideways sway once per cycle, applied in view space | The trolley feeling goes. Standing still does not bob; mid-air does not advance the phase. The same phase later times footsteps. |
| An honest start: `chooseStartPose` searches rings outward from the centre against the same obstacle list `stepPlayer` collides with; deterministic | A tree that blocks walking blocks spawning. (It later moved to `util/openSpot.ts` so `world/` can site the hut with it.) |
| Crouch on `Ctrl` (hold), sprint on `Shift` | Standard FPS layout; `Shift` used to be crouch, which every FPS player presses to run. |

### Finding your way

| Decision | Why |
|---|---|
| A scrolling compass strip at the top: `bearingDegrees(yaw)` (0 = north), `compassLabel` to the nearest of eight points | Direction, never position. A map with a dot on it would take away half the pleasure of a walk — finding your way is part of the game. |
| A minimap ported from `race-the-city`, **off by default** (`Prefs.minimap`), drawing paths and water once to an offscreen canvas, with exactly one marker: the hut | The compass stays what is always on screen. The map never shows a single mushroom. |
| `headingFromYaw` converts the player's yaw to the map's rotation | `player.yaw` and the map's `atan2` heading use different sign conventions — the same mismatch the compass already solved; tested on all four cardinal directions through `stepPlayer`'s real motion formula. |
| `H` shows the key list in-game; a dim "H — controls" hint stays in the HUD | The key list was shown once, on the first-run screen, and never again. |

### Menus

| Decision | Why |
|---|---|
| A settings menu of our own on `M` (`ui/settingsMenu.ts`): walking speed and mouse sensitivity as multipliers, mushroom draw distance, language; stored in `Prefs` | The donor's menu is about cars, cities and race modes. Time of day and weather join it only once those systems exist — a slider with nothing behind it is worse than none. |
| Invert look (`Prefs.invertMouseY`), applied by both mouse and touch look; the menu's on/off row becomes a `toggle(key, labelKey)` helper | The second real boolean row is the moment to extract the helper, not before. |
| The version in a corner of the HUD and on the title screen (`__APP_VERSION__`) | A bug report with a screenshot carries its version. |
| `Esc` opens a **pause menu** (Continue, Settings, Change location, Encyclopedia, Basket); a second `Esc` opens the exit confirm on top of it | Each button calls an existing entry point (`openSettings`, `openEncyclopedia`, `showTally`, the reload the exit confirm already does) — no logic is duplicated. The exit confirm guards against a duplicate overlay so "Stay" leaves a working pause menu. |
| The HUD gear opens the pause menu, not settings directly; its tooltip becomes "Menu — Esc" | Touch has no `Esc`; without this a phone player could never change location. |
| Pointer Lock is requested in the place picker's own click, as its promise resolves | The "Go" click lands on the picker's button, not the canvas, so the canvas never asked for the lock and mouse-look stayed dead until a second click. The request must sit inside that click's activation window — before `loadForestData`, which can take seconds over the network. |
| Every overlay scrolls: the outer `position:fixed; inset:0` container only scrolls (`overflow-y:auto`), an inner `min-height:100%` wrapper does the centring | A real mobile browser's address bar eats part of `inset:0`; centring and scrolling on one flex element clips the unreachable part instead of letting it scroll — the first-run screen's button sat off-screen on phones. |
| The first-run disclaimer screen is **removed entirely**, with its HUD/encyclopedia banner, `SaveData.disclaimerSeen` and its i18n keys | It blocked the game on mobile past fixing, and the owner asked for it gone rather than fixed again (`CLAUDE.md`, Responsibility). `edibility` is still checked against two sources during curation. |

## 2. Out of scope

- Touch buttons for the new keys beyond what touch already has.
- A map that shows finds — never.

## 3. Testing

- `stepPlayer` slopes: a gentle slope unslowed; moderate uphill slowed; cliff
  blocked; downhill never slowed. Jumping: leaves the ground; rises to a real
  peak and lands; no jump airborne; forward speed unchanged; no jump
  crouched. Bob: still when not moving; advances with distance; not while
  airborne; never below eye height; sways sideways. Sprint faster, refused
  crouched.
- `chooseStartPose`: centre when clear; moves off a tree; never inside a
  tree's radius; in the plot; deterministic; falls back to the centre;
  custom origin; wider clearance.
- `bearingDegrees`/`compassLabel`; minimap `regionToOffscreen`,
  `headingFromYaw`.
- Live, headless Chrome: first `Esc` opens `#pauseMenu`, not `#exitConfirm`;
  five buttons; Continue closes it; a second `Esc` stacks `#exitConfirm`.
  A 220 px-high viewport: the overlay button is reachable by scroll.
  (Pointer Lock cannot be proven headless — it rejects with
  `WrongDocumentError` whichever click asks — so the Go-click fix is
  confirmed on the owner's next real session.)
