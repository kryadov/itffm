# Small finds you can actually pick, a collection worth keeping — design

Date: 2026-09-09
Status: approved, in implementation.
Builds on: `docs/superpowers/specs/2026-09-08-forest-finds-design.md` and the
playable slice's basket and encyclopedia.

## 0. Why

Three threads that all come down to "what happens between seeing a find and
keeping it":

1. **Berries cannot be picked.** Three live reports in a row since the
   forest-finds release: mushrooms take `E`, berries do not. Three fixes to
   the aiming logic (a forgiving cone for small objects, then a cone that
   ignored grass, then a cone that ignored neighbouring specimens of the same
   colony) were each correct in a test and still failed in the player's hands.
   The `?debug=1` panel on the owner's own session finally showed why: the
   nearest berry was 1.46 m to the side of the aim ray. A berry model 1–2 cm
   across is a few pixels at any sensible distance. No amount of aiming logic
   fixes an object too small to aim at.
2. **The basket is a text list, and a find leaves no trace.** Picking a
   mushroom should be an event; the basket should show what is in it.
3. **The collection has nowhere to go.** The encyclopedia fills up and that is
   the end of it — nothing personal on a card, nothing to show anyone.

And one cost that grows with the collection: a few hundred finds in the wood,
each a merged mesh drawn at full detail out to the cull distance.

## 1. Decisions

| Decision | Why |
|---|---|
| A berry grows on a real **bush**: several stems (`orientAlong()` points a cylinder from base to tip) carrying leaves, berries at the stem ends | The owner suggested it, and it solves both complaints at once: berries read as berries, and the object is big enough to aim at. |
| `BerryMorphology.bushHeight` (mm): creeping lingonberry 100–180, single-stemmed cloudberry 120–220, knee-high bilberry 250–400 | One `size` factor drives the bush like every other model — no chimeric proportions. |
| All the special small-object aiming code is deleted; small finds get an invisible pick sphere (`collectible/worldMesh.ts`'s `withPickHitbox`) | One aiming rule for every kind is easier to trust than a fallback cone with three ways to go wrong. The sphere never draws (`opacity: 0`, no depth write) but still raycasts — three.js's raycaster does not check `visible` (verified in the three@0.169.0 source; an old comment claiming otherwise is corrected). |
| The hitbox sizes and centres itself on the model's own `Box3`, never below `HITBOX_RADIUS` (12 cm) | A fixed sphere at ground level misses the top of a bush; a bush-sized one centred on the bush does not. |
| `?debug=1` stays: aim, player position, view angle, distance and angle to the nearest small find | It found this bug when reasoning could not. The next "works for me, not for them" report starts there. |
| The basket (`Q`) is a grid of 3D preview cards, one per specimen with its own seed and age — not grouped counts | `ui/preview.ts`'s `renderCollectiblePreview`, pulled out of the encyclopedia to serve both. |
| Picking leaves a dark disc of disturbed litter where the find stood (`leaveTrace()`), for every kind | The wood remembers the visit. |
| A note per find (`Find.note?`), set by `setFindNote(save, at, note)` and edited in the basket card, saved on `blur` | `at` (the pick timestamp) is already the find's identity — no new id. A `WeakMap<Placement, number>` links a card to its save record at the one moment both exist: the pick. |
| Export the encyclopedia as one PNG: discovered species only, the same previews, a grid with captions | Something to show. Only what this player found — nothing to show off in someone else's finds. Grid arithmetic (`ui/export.ts`'s `columnsFor`, `layoutGrid`) is pure and tested; drawing and download are DOM. |
| Every world find is a `THREE.LOD`: full geometry to `LOD_DISTANCE` (18 m), beyond it one six-sided cone fitted to the mesh's bounding box and filled with the **average of its own baked vertex colours** | A chanterelle stays a yellow fleck and a russula a red one, not a grey placeholder. The function knows nothing about species or kind, like `toWorldMesh`. The hard 45 m cull stays outside both levels. |
| `Forest.updateMushroomLod(camera)` updates a separate `lods` list every frame | three.js `LOD` does not switch on its own; and the list cannot be the pickable objects, because small finds wrap their LOD in a hitbox group. `THREE.LOD.raycast()` already tests only the active level, so picking needs no change. |
| `npm run silhouette-sheet` renders every species' silhouette (the encyclopedia's own undiscovered mode) on one contact sheet, reusing `columnsFor`/`layoutGrid` | "Look at it" across the whole roster at once — one screenshot per species no longer scales. Not a pass/fail test and not in CI: pixels drift between GPUs, the same reason `boot-check` stays out. |

## 2. Out of scope

- Instancing finds of one species. It would need a finite set of shapes per
  species, which trades away "no two mushrooms alike" — a design call to make
  with the owner, not alone.
- A field-guide export (a page per species with text). The PNG is a picture
  of a collection, not a book.

## 3. Testing

- `berry/build.ts`: a low creeping species is visibly shorter than a
  knee-high one; still tens of centimetres.
- `collectible/worldMesh.ts`: the hitbox wraps the mesh as a child, never
  draws but raycasts, is hit by a ray the bare speck never could, never
  shrinks below the floor radius, grows and centres on a larger model. The
  LOD proxy is far cheaper, fills the same footprint, takes the mesh's own
  colour, has no per-vertex colour; the LOD shows the real mesh close and the
  proxy beyond `LOD_DISTANCE`, and swaps as the camera moves.
- `game/pick.ts`: a tiny find dead ahead is found through its hitbox, within
  the distance, still hidden behind a real occluder, and two specimens of one
  colony centimetres apart are told apart.
- `save/store.ts`: `setFindNote` sets the note on the find with that
  timestamp and leaves others alone.
- `ui/export.ts`: at least one column; roughly √count; capped; reading
  order; height grows with rows; empty collection safe; every cell inside.
- Live: a scripted walk to a berry at 2 m and an ordinary view angle — the
  label appears, `E` collects it. Then the owner's own session with
  `?debug=1`. Then `npm run silhouette-sheet` and look at all of it.
