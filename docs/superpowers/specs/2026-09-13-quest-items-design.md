# Four quest items with real abilities — design doc

Date: 2026-09-13
Status: approved, in implementation.
Extends: `docs/superpowers/specs/2026-09-13-fetch-quest-design.md` (the fetch
quest with natural detours).

## 0. Why

The first fetch quest proved the shape: one lost thing, a real detour, a `E`
to pick up and deliver. One quest with no consequence past a completion
message is thin. Four quest items — a hatchet, a lamp, a fishing rod, a
bicycle — each unlock something real in the wood once delivered, so finding
them matters beyond a checkbox.

## 1. Decisions

| Decision | Why |
|---|---|
| Four independent quests, any order | No item gates another; each is placed and completable on its own. Simpler to build and test, and the player picks what to chase first. |
| Generalize `Quest`/`placeQuestItem` from one item to a small fixed list, keyed by item id (`'axe' \| 'lamp' \| 'rod' \| 'bike'`) | Same placement/detour/state-machine code already built for the lost basket; this is a list instead of a single value, not a new system. |
| Hatchet only clears scrub/thicket-class obstacles (the same kind `thicketObstacles` already generates), never mature trees | `world/trees.ts` batches all trees per chunk into one mesh for draw-call reasons (CLAUDE.md's "flatten for the wood" rule) — trees were never built to be removed one at a time. Scrub is already a separate, per-object thing; extending that to be visible and choppable is a small, honest addition. Keeping mature trees permanent also keeps the wood a wood. |
| Lamp is an always-on point light on the player once owned (night outdoors, always inside mines), not a handheld beam | Matches the existing `PointLight` pattern already used for the shelter's window lamp — same technique, new position (the player), no cone/aim logic. |
| Mine entry stays physically open always; the lamp's effect is that the interior is otherwise almost unlit | No new blocking/gating mechanic to build and test; "you can walk in but you can't see" is a lighting change, not a collision change. |
| Fish is a new `Species` `kind: 'fish'`, following the forest-finds pattern | `docs/superpowers/specs/2026-09-08-forest-finds-design.md` already generalized `Species` to a kind-discriminated union with per-kind morphology/traits — fish is another kind in that union, not a parallel system. |
| Fish can be seen before the rod is delivered, but only picked up once it's owned | Reuses the existing crosshair-raycast pick flow (`game/pick.ts`) unchanged; the gate is "is the rod owned", checked the same way delivery already gates each ability. |
| Bicycle is a passive stat, not a rideable object | No mount/dismount animation, no second camera rig, no new input — once delivered, the existing per-frame speed calculation gets one more multiplier, symmetric to the existing wetland one. |
| No skills/inventory screen | Each ability is a boolean already implied by `quest[id].state === 'done'`, persisted in the save. A UI screen listing "your abilities" is speculative until there's a reason to browse them. |

## 2. Flow (per item, all four are the same shape)

1. On a new game, each of the four items is placed 30-45m from the shelter
   in its own random direction (same `placeQuestItem`, now called once per
   item id with a seed derived from the world seed + item id so the four
   don't collide or reuse the same angle).
2. Each placement gets its own detour: real water/wetland if the straight
   line meets one, else a generated thicket band — unchanged from the first
   quest, just run four times.
3. `E` near an item picks it up; `E` at the shelter door while carrying
   delivers it. Same interaction as today, now dispatched per item id.
4. Delivery flips that item's persisted state to `'done'` and turns on its
   ability immediately (no restart needed):
   - **Hatchet (`axe`)**: scrub/thicket objects (including ones generated for
     the *other* three quests' detours) become choppable — `E` facing one
     removes it from the scene and from the obstacle list.
   - **Lamp (`lamp`)**: a `PointLight` attached to the player turns on
     whenever `nightFactor() > 0` outdoors, and unconditionally inside a
     mine's radius.
   - **Rod (`rod`)**: fish (`kind: 'fish'` species, spawned near water the
     same way other finds spawn by ecology) become pickable; before that
     they're visible but picking them is a no-op, same class of gate as
     "you need the rod first".
   - **Bike (`bike`)**: standing on/near an OSM path/track multiplies
     movement speed, same mechanism as the existing wetland slowdown, just
     the opposite direction and a different terrain test.
5. A one-line prompt appears once per item when the game starts (four short
   lines, or one combined line — a UI detail, not an architecture decision).

## 3. Architecture

### 3.1 Quest module generalizes from one to four

`src/quest/state.ts` and `src/quest/placement.ts` stay pure and unchanged in
shape; the *caller* now holds a small record instead of one `Quest`:

```ts
export type QuestItemId = 'axe' | 'lamp' | 'rod' | 'bike'
export type Quests = Record<QuestItemId, Quest>
```

`tryPickUp`/`tryDeliver` still operate on one `Quest` at a time — the wiring
in `main.ts` picks the right entry by proximity, same as it already picks
"the door" vs "the item" by range today.

### 3.2 Hatchet: scrub becomes a real, choppable object

Today `thicketObstacles` returns bare `{x, z, radius}` circles with no visual
representation and no per-object identity. This item needs both:

- A visible mesh per scrub circle (reuse an existing simple bush/branch
  primitive style already used for decoration elsewhere in `world/`, not a
  new modelling system).
- A per-chunk mutable list (mirroring `worldStream.ts`'s existing
  `removeMushroomObject` pattern) so `E` while facing a scrub object, once
  the hatchet is owned, removes that one entry from both the scene and the
  obstacle array.

Only objects built by `thicketObstacles` (this quest's detours, for any of
the four items) are choppable — never `world/trees.ts`'s batched trees.

### 3.3 Lamp: a moving point light, and a darker mine

- `game/scene.ts` gains a `PointLight` following the player (position updated
  per frame, same update cadence as the camera), off by default.
- Turned on by: `quests.lamp.state === 'done' && (nightFactor() > 0 ||
  playerInsideMineRadius)`.
- `world/mine.ts`'s interior lighting is reduced (lower ambient/local light
  regardless of time of day) so that without the lamp, a mine is genuinely
  hard to see in — this is a lighting-value change local to the mine's own
  lights, not a new subsystem.

### 3.4 Rod: fish as a fourth collectible kind

Following `2026-09-08-forest-finds-design.md` §2.1-2.3 exactly:

- `Species` union gains `{ kind: 'fish'; morphology: FishMorphology; edibility: Edibility }`
  — unlike `find`, a real fish genuinely is or isn't edible, so it keeps
  `edibility` required, same as mushroom/berry/herb/nut.
- `src/fish/build.ts` — `buildFish`, `toWorldMesh`, `traitsFor`, same shape
  as `src/berry/`, `src/herb/`, etc.
- `ecology/sites.ts` gets fish's spawn condition keyed to proximity to
  `world.water` (already available data) instead of substrate/mycorrhizal
  fields, the same "stretch an existing field's meaning" compromise already
  accepted for `find` in the forest-finds doc.
- `game/pick.ts`'s existing crosshair pick flow needs one small addition: a
  fish's pick action checks `quests.rod.state === 'done'` before it does
  anything (mirrors how a locked door doesn't open without a key — a single
  guard clause, not a new interaction system).

### 3.5 Bike: a path-speed multiplier

- `src/world/paths.ts` (or a small new pure helper next to it) gets a
  `distanceToNearestPath(pos, paths): number` — reuses the same ribbon
  geometry `buildPathMeshes` already walks.
- `game/player.ts`'s `biomeSpeedFactor` gains a bike-speed check symmetric to
  `WETLAND_SPEED`: when `quests.bike.state === 'done'` and the player is
  within the path's width of its centreline, multiply speed up (e.g. 1.6x,
  exact number tuned during implementation, not an architectural decision).

### 3.6 Save persistence

`save/store.ts`'s single `quest?: Quest` field becomes `quests?: Partial<Record<QuestItemId, Quest>>`
(optional per key so an old save without the new items still loads — missing
keys mean "not yet placed", handled the same way a brand-new game handles
all four).

## 4. What does NOT change

`ecology/sites.ts`/`ecology/spawn.ts`'s core pipeline, the mushroom/berry/
herb/nut/find kinds, the encyclopedia's existing filters, `game/pick.ts`'s
raycast mechanism itself, and `quest/state.ts`'s state machine shape are all
reused as-is. No new UI screen, no minimap, no waypoint arrows, no mount/
dismount animation, no mini-game for fishing.

## 5. Testing

- Unit: quest placement for four ids doesn't collide/overlap (distinct
  seeds), the hatchet's scrub-removal function (obstacle + mesh both drop),
  the lamp's on/off condition as a pure function of `(nightFactor, insideMine,
  owned)`, fish's pick-gate guard, the bike's path-distance/speed-multiplier
  function.
- Selective integration: obstacle list updates after a chop; save round-trip
  for the new `quests` shape including a partially-populated (old-save)
  case.
- `npm run boot-check` after wiring (touches `main.ts`/scene assembly).
- `npm run silhouette-sheet` after the fish morphology exists, to eyeball it
  next to the existing species per the project's "look at it" convention.
