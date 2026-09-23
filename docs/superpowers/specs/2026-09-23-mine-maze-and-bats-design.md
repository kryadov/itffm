# The mine as a maze, with bats — design

Date: 2026-09-23
Status: approved with the owner, to implement in the next batch.
Builds on: `2026-09-15-mine-cave-design.md` (a segment graph of passages, a
diamond chamber) and its plan.

## 0. Why, and what the mine taught us since

The cave from the 2026-09-15 design shipped, and then had to be rebuilt:

- **v0.95.1** — the player's height and the slope check followed the real
  hillside outside instead of the cave floor once you crossed into it; for
  some worlds the mine was physically unenterable.
- **v0.96.0** — the tunnels were dug 5–7 m under the hill, so only slivers of
  single-sided, separately jittered quads poked out; the 2D wall circles
  stood as invisible walls across the trail; the mouth was buried under the
  terrain mesh. The fix was structural: **one signed-distance field**
  (`caveSdf`) drives the mesh lattice, the collision and the floor, so the
  three can no longer disagree. A flat floor at door height, 3.2 × 2.8 m
  passages (`TUNNEL_WIDTH`, `TUNNEL_HEIGHT`), a levelled apron and a wide
  doorway in a rock outcrop; a closed, watertight interior lit only by the
  player's lamp and flashlight plus a fading pool of daylight at the door.
  The terrain mesh is reshaped around the mine (`mineTerrain.ts`) so it never
  reaches into a passage.
- The outcrop's rock face and grassy mound disagreed on lighting along their
  shared edge; they now share one normal there.

What is left is the point of the place. With three to five forks the
"search" for the diamond is a glance down each branch. The owner wants a
real maze, and something alive in the dark.

## 1. Decisions

### The maze

| Decision | Why |
|---|---|
| Nine to twelve forks, some three ways; longer passages; seven to fourteen dead ends; some forty metres of depth | Enough that the lamp matters and the way back is something to remember. |
| A passage that would break into another is cut back or dropped, so **solid rock always stands between passages that are not joined** | The old graph could already cross two passages — a shortcut through a wall is a hole in the maze, and in an SDF union it opens silently. |
| Two passages out of one fork keep at least 0.7 rad apart | Narrower and the two openings merge into one wide mouth. |
| No passage turns back through the mouth; the whole system keeps within half the plot | It must stay under its own hill and inside the wood. |
| The diamond chamber is the leaf **farthest along the tunnels** from the mouth, widened only as far as the rock around it allows | A random leaf can be the first turning. The far end makes the search the whole maze. |
| A lattice cell folded by the pull onto a diagonal outline gives the pull back | The bigger graph exposed folded floor quads the small one never produced. |
| `placeMine` keeps the mound clear of the hut, the campfire, the fisherman's shack, the stations and the rails (`keepClear`), and turns tunnels away from a trail through the mouth | A system dozens of metres across grows a mound to match; without an explicit list of what it must not cover, some seed will bury the hut. |

### The bats

| Decision | Why |
|---|---|
| A few colonies hang head down from the ceiling at dead ends (`placeBatRoosts`), wings wrapped round them — never in the diamond's chamber | Dead ends become places, not just failures; the chamber stays the diamond's moment. |
| Within 5 m of one, **inside the mine**, the whole colony takes wing (`shouldFlush`), flies figure-eights up and down its own passage for `BAT_FLIGHT_SECONDS` (7), never leaving it, then settles back (`batPose`, a pure function of roost, index, time and flush time) | A jolt, not a threat. Kept to its passage so no bat ever flies through rock. |
| Instanced body and two wings; lit by the **cave's own material** (`caveLitMaterial` shares the cave's uniforms), so only the lamp, the flashlight and the daylight at the mouth show them | A bat lit by the sun inside a black tunnel would be a bug. |
| `&tp=mine` and `&tp=bats` debug hooks | Finding a colony at a frame a second is otherwise a long walk. |

### The outcrop (from the same review)

| Decision | Why |
|---|---|
| The outcrop is a **mossy hill with a rock face only at its door**: the sheer face stands a few metres either side of the doorway (`FACE_HALF_EXTRA`), and beyond it the mound slopes away like its flanks | It read as a long grey wall with a bare grey top. |
| The face is cut in rows that recede unevenly, in layered strata; the crest rises and falls (up to 1.8 m); the surface is moss and grass with rock in patches; mossy boulders lie along the foot and the brink (`outcropBoulders`, shared by mesh and collision) | Rock in a northern wood is layered and overgrown. Sharing the boulder list keeps what you see and what you bump into the same. |
| The flanks stay past the slope limit and the foot ring of collision holds | It still must not be climbable onto the tunnels. |

## 2. Out of scope

- A map of the mine, chalk marks, a ball of thread.
- More than one level.

## 3. Testing

- Graph: one root at the entrance; flat floor; every segment continues from
  its parent; exactly one diamond chamber; a real maze on every seed (many
  dead ends, a long way round); the diamond in the farthest dead end; solid
  rock between unjoined passages; deterministic; never back through the
  mouth; the system and its mound fit the plot; the mound never buries the
  hut, campfire or rails on any seed.
- SDF, mesh and collision: the existing closed-mesh, no-folded-cell,
  doorway-only-open, nothing-escapes checks over many seeds; walking from the
  meadow to the diamond chamber and back on every terrain type; no invisible
  wall on the meadow; the mound unclimbable from any side; boulders along
  the foot and the brink, clear of the doorway.
- Bats: deterministic roosts in dead ends inside passages, never the chamber;
  head down at the ceiling at rest; take wing when flushed and stay in the
  passage the whole flight; actually fly about; settle back; flush only near,
  inside, and when not already up; instanced and lit like the cave.
- Look at it: `&tp=mine` from the meadow; walk to the chamber; `&tp=bats`
  with the flashlight on.
