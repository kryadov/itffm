# The hut, the campfire and the fisherman's shack — design

Date: 2026-09-09
Status: approved, in implementation.
Builds on: the first hut (`world/shelter.ts`, v0.6.0 — one per wood, the
player's starting point) and `docs/superpowers/specs/2026-09-07-wood-dressing-design.md`.

## 0. Why

The hut went in yesterday as the player's starting point: a box with a roof,
placed by `findOpenSpot`. Live feedback the same evening and this morning,
with screenshots and the `?debug=1` panel, is consistent — it is a toy:

- the eye line sits above the door (the walls were 1.7 m, the player's eye is
  1.65 m);
- the windows are invisible from outside, then visible only from one side;
- the firewood looks like it grows out of the wall;
- the well reads as "two sticks over a stone puddle";
- you cannot go in, and there is nothing inside to go in for.

And the owner asked for two more fixed places in the wood: a campfire with a
pot, and — where there is water — a fisherman's hut and a boat.

The thread through all of it: a landmark is worth having only if it stands
up to being looked at from a metre away.

## 1. Decisions

### The hut

| Decision | Why |
|---|---|
| Human scale, from the player outward: walls 2.3 m, door 0.95 × 2.0 m, footprint 3.0 × 2.6 m; `SHELTER_RADIUS` derived from the box's half-diagonal plus a margin | The eye (`STAND_EYE` 1.65 m) has to sit below the lintel with headroom. A taller box at the old footprint looks like a silo, so the footprint grows with it. |
| Windows are real frames: a cross of **box** muntins and glass in front of a recess | Planes are invisible from one side; boxes are not. This is the third report about windows — fix the class, not the instance. |
| The hearth light casts shadows, and only it: `walls.castShadow/receiveShadow`, the light's `castShadow`, the ground's `receiveShadow` | Nothing in the game had shadows on, so a light inside the hut lit the ground straight through the walls and floor. Shadows for one light and one object are cheap; for the whole wood they are a separate question. |
| Firewood stacked along the wall it leans on, log ends facing out; a test intersects every log's `Box3` with the wall | The old stack laid logs and rows along the same axis, so every log overlapped its neighbours and reached back through the wall even though the stack's anchor point was outside. The old test only checked the anchor. |
| The well stone ring is waist-high (0.55 m), posts 1.05 m | Knee-high stone under a roof reads as a puddle; waist-high is where you lean and set a bucket. |
| Windows glow and the hearth lights at night through `setNight(n)`, fed by `updateDayNight` | The same night signal that colours the sky — no second notion of "night". |
| Smoke from the chimney: sprites on a lifecycle `t`, their offset/scale/opacity formulas moved to `world/smoke.ts` | The campfire is the second real user of the same formula — that is the reason to share it, not tidiness. |
| **Enterable**: the walls are six panels (two either side of the doorway, a lintel, three blank walls) plus a plank floor | A solid box can be neither seen into nor walked into. |
| A real door on a hinge (`doorHinge` group), swinging toward a target angle each frame | A door that snaps is a toggle; a door that swings is a door. |
| Wall collision is a ring of small circles (`WALL_CIRCLE_SPACING` 0.3 m, radius 0.16 m) with a gap at the door; the doorway itself is one **mutable** circle shared by reference | `game/player.ts` only knows circles. The circles are close enough that the player (radius 0.3 m) cannot slip between two. `toggleDoor()` changes the shared circle's radius; `stepPlayer` reads obstacles by reference, so nothing is rebuilt. |
| Wall circles stop their own radius short of the doorway's visible edge | Caught by an integration test before any screenshot: circles centred on the edge ate the doorway twice over and left a gap of centimetres. |
| `E` within `DOOR_INTERACT_RADIUS` of `doorPosition()` opens and closes the door; on touch, a tap that hits no find near the door does the same | A door is room-sized, not mushroom-sized — distance, not aim. |
| Furniture: a bed and a table against the side walls (`BED_X`/`TABLE_X` derived from `WIDTH`), a cup on the table, a painting on the back wall; bed and table are solid (`interiorObstacles()`) | A centre corridor from door to back wall stays clear. |
| The painting is flat shapes — sky, a strip of land, a sun, two conifer silhouettes — with `DoubleSide` | The project draws without images. Double-sided so it cannot repeat the windows' one-sided bug. |
| When OSM maps a hut in the plot (`isShelterTag`: `tourism=wilderness_hut`, `amenity=shelter`, `building=hut`, `man_made=tower`), the hut stands there; orientation still comes from the seed | A surveyed find beats a procedural guess, as with OSM trees. A building's polygon becomes a point by `util/geometry.ts`'s `centroidOf`. `building=hut` is the one deliberate exception to "buildings are not our business", narrowed to that single value. |

### The campfire

| Decision | Why |
|---|---|
| A second fixed landmark, deliberately **not** beside the hut: `placeCampfire` searches from a point opposite the hut through the plot's centre (with noise), and only on a clearing | A campfire is a destination. `util/openSpot.ts`'s `findOpenSpot` gains an optional `extra` predicate ("clear **and** a clearing") instead of a second copy of the ring search. |
| Crossed charred logs in a ring of stones; embers in a white-yellow-red palette (`EMBER_COLORS`), each flickering on two out-of-step sines | The owner asked for that palette. Sines, not `Math.random`, so it is deterministic. |
| A point light flickers with the embers and burns by day and night | Embers glow regardless of daylight, unlike the hut's windows. |
| A tripod of three poles holding a pot; a bench facing the fire; one collision circle round ring and bench | Cylinders between two points use the same `setFromUnitVectors` trick as the berry stems. |

### The fisherman's hut and boat

| Decision | Why |
|---|---|
| `placeFisherHut` returns `null` when the wood has no water | No shack in a dry pine wood — an honest absence. |
| A pond is preferred to a stream when both exist (`classifyWater`) | A fisherman's hut stands on a lake shore, not along running water. |
| The shack is deliberately simpler than the hut: one solid box, a roof, a fake door, a window, one collision circle; no interior | Nobody asked to go in. Repeating the hut's wall work for a second building costs more than it gives. |
| The boat is an `ExtrudeGeometry` of a flat outline tapering at both ends, drawn up on the bank along the shore's tangent | Neither a box nor a cone narrows at both ends. Along the shore, not bow-in — a boat pulled out, not one about to leave. |

## 2. Out of scope

- A foundation that follows uneven ground under the hut.
- A visible light source inside the hut — the hearth light hangs in the air
  for now.
- Going inside the fisherman's hut.

## 3. Testing

- `world/shelter.ts`: deterministic placement; stands where a surveyor mapped
  one; ignores a mapped hut outside the plot; falls back to the search with
  none; obstacle covers the footprint, corner included; muntins on every
  window; firewood and well present; **no log intersects the wall**; dark by
  day, glowing at full night; smoke drifts without throwing; wall circles
  leave the doorway open and rotate with the hut; the door circle sits at
  the doorway and blocks the whole gap; the door starts closed, toggles,
  and swings over time; **integration: `stepPlayer` is blocked by the closed
  door and walks through the open one**; bed and table have their own
  collision and rotate with the hut; the cup sits on the table's surface;
  the painting has more than one colour.
- `world/smoke.ts`: a wisp starts at the source, rises, drifts sideways, each
  phase its own way, grows, never starts at scale 0, fades monotonically.
- `util/openSpot.ts`: the `extra` predicate is required too; falls back to
  the origin when nothing in range satisfies it.
- `world/campfire.ts`: deterministic, on the ground, in the plot, apart from
  the hut, clear of obstacles; ember palette is more than one colour; pot on
  a tripod; bench facing the fire; flicker stays in a sane range.
- `world/fisherHut.ts`: null without water; deterministic; boat at the
  water's edge, hut further back; pond preferred over stream; obstacle blocks
  the shack; the boat is longer than it is wide.
- Look at it: from outside at the door, from the side with the door open,
  from inside; the campfire by night; the shack and boat from above.
