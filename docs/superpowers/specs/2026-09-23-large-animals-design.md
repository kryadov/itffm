# Moose, bear, boar, beaver — and real bodies for every animal — design

Date: 2026-09-23
Status: approved with the owner, in implementation.
Builds on: `2026-09-10-wildlife-design.md` (the critter state machine) and its
plan.

## 0. Why

Live report: the animals barely look like animals. Each is one colour and a
few diamonds with no legs. And looked at closely, most of them run **sideways
or tail-first**: a mismatched sign draws every one facing `(cos h, −sin h)`
while it moves along `(cos h, sin h)`. Birds have the same slip, and are 3 m
octahedra with 1.2 m triangle wings.

A northern wood without its large animals is also missing the thing a walker
most remembers: the moose crossing a clearing, the place where a bear has
torn up an anthill.

## 1. Decisions

### Bodies

| Decision | Why |
|---|---|
| One rig for every four-legged animal (`world/animalRigs.ts`'s `quadRig`): a torso, a head on a **neck pivot**, four legs on **hip pivots** | Legs that swing and a head that lowers are what make a shape read as an animal. A shared rig means a new species is proportions and colours, not code. |
| Each part is one merged, vertex-coloured mesh built from primitives (`ellipsoid`, `limb`, `cone`, `merge`), one material per species, one draw call per part | Colour variation without textures; the same draw-call arithmetic as everything else instanced. |
| Legs swing with a walk or a bound driven by **distance covered**; the head lowers to graze and nibbles; sizes and coat shades vary per animal | Distance, not time, as for the player's own bob — standing animals do not paddle the air. |
| Hare, squirrel and adder are rebuilt on the same rigs at real proportions (the snake as `SNAKE_SEGMENTS` 20 along its body) | One standard for every animal. |
| The facing sign is fixed everywhere, and tested: a fleeing hare runs head first whichever side the player is on; a wandering moose walks head first | The bug that made most of them run sideways. |
| Birds: head first, crow-sized, a spindle body with a paler breast and a fanned tail, a head with a beak and eyes, wings with fingered flight feathers; the landing approach curves onto its run-in and its gate is never more than halfway | The same sign slip; plus a landing that snapped half a turn in one frame and sometimes flew to its gate tail-first. |

### Behaviour

| Decision | Why |
|---|---|
| Idle animals **wander** about their home — turning first, then walking — within a radius, and walk back home after a scare | Standing still between scares looked stuffed. |
| **Moose**: browsing and wandering slowly, trotting off if you come close; bulls (`MOOSE_BULL_SHARE` 0.55) carry broad palmate antlers, cows none | The animal of the northern wood. |
| **Brown bear**: one, living at the thickest patch of berries and mushrooms (`placeBearHomes`), head down eating; moves off at a walk when it notices you — never toward you; none where there is no food | A bear is where the food is. It does not chase: this is a walk, not a survival game. |
| **Wild boar**: a sounder that keeps together round one spot, rooting | Boar are never seen alone. |
| **Beavers**: only where the wood has water (`placeBeaverHomes`), at a tree near it, facing the trunk on the water side, gnawing; they flee into the water | No water, no beaver — the same honest absence as the fisherman's hut. |
| The `?debug` hooks `&tp=animal:<kind>` and `window.__animals()` | Headless Chrome renders a frame a second; looking at a specific animal has to be one URL. |

## 2. Out of scope

- Danger. Nothing attacks.
- Tracks for the big animals.
- Large animals in streamed chunks — they are one-per-wood like landmarks.

## 3. Testing

- Facing: a fleeing hare runs head first with the player on each side; a
  wandering moose walks head first.
- Wandering: moves about but never past its radius; walks back home after
  fleeing; stays put without a wander spec.
- Each new species: a named group, deterministic, with legs and a head; bull
  moose antlered and cows not; legs swing while walking and hold straight
  while standing.
- `placeBearHomes`: the thickest food patch; none without food.
  `placeBeaverHomes`: at a tree near the water, facing its trunk on the water
  side; none without water. The boar stay together.
- Birds: fly head first; their size is checked on a screenshot.
- Look at it: `&tp=animal:moose&back=18` and each other kind, by day and in
  fog.
