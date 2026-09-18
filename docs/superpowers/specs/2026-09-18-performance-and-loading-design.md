# Performance: what was done, and the frozen loading screen — design

Date: 2026-09-18
Status: §1 records what shipped in v0.77.0–v0.82.1; §2 is approved, to
implement next.
Builds on: `2026-09-10-infinite-world-design.md`,
`2026-09-09-finds-and-collection-design.md` (LOD).

## 0. Why

The live report of 2026-09-11 — FPS drops and 100% GPU/CPU on an RTX card,
stutter while walking, shadows shimmering while standing still — started a
performance pass that was partly done in the same batch. It is worth writing
down what was done and why, because each fix was bounded on purpose, and the
bounds are easy to forget.

A new report since: on a large real place the loading screen **freezes** —
the spinner stops for 20–30 seconds and the screen goes dark before the wood
appears. That one is §2.

## 1. What shipped, and its limits

| Decision | Why | Honest limit |
|---|---|---|
| Static scatter is culled by distance (`world/instanceCulling.ts`): an `InstancedMesh` instance beyond `SCATTER_CULL_RADIUS` (155 m — past the fog's 140 m) gets a zero-scale matrix, and its exact original transform back when in range | An `InstancedMesh` cannot drop one instance cheaply; a degenerate matrix draws nothing in the same buffer and draw call. Fog hides distance but the GPU still rasterised everything inside the 1500 m sky dome. | The real frame-time win is GPU-bound and cannot be measured in headless SwiftShader; only correctness and cost of the sweep are verified. |
| Only named static-scatter groups are culled (`STATIC_SCATTER_GROUP_NAMES`: trees, boulders, deadwood, undergrowth, flora, grass) | Birds, critters and insects re-pose their own instances every frame and would fight it. | — |
| The sweep runs every `SCATTER_CULL_INTERVAL_FRAMES` (20), recomputed fresh from the current position | A full pass over a few thousand instances is cheap once and wasteful 60 times a second for something that changes at walking pace; being a pure function of position, it can run rarely without going stale. | — |
| A streamed chunk's placements are built in slices: `PLACEMENT_BUDGET_PER_UPDATE` (16) per `update()`, across all chunks mid-build | Measured: a chunk's terrain + trees + scatter + sites cost ~100–130 ms, and building its ~130 finds' meshes cost **another** 110–150 ms on top — the single biggest piece. | The terrain/trees/scatter/sites half is still one synchronous stall per new chunk; slicing it needs untangling their dependencies or a Worker. |
| Trees within `TREE_SHADOW_RADIUS` (45 m) of the home clearing cast shadows; everything further out does not | Bounded by construction — a fixed radius, split into its own instanced batches. | "All 1500 trees honestly shadowed" is still an unmeasured real-GPU question. The standing-still shimmer is most likely PCF sampling noise at a 1024 shadow map, not a bug; telling them apart needs a real device. |
| Chunk seams: one shared litter-colour seed for the whole world (`globalSeed + 17`), and the demo home plot built at the streamed chunks' own resolution (`CHUNK_GROUND_SEGMENTS`) | `litterColor`'s seed picks a whole noise field, so per-chunk seeds jumped the colour at every border; and a 220-segment home mesh against 60-segment neighbours left a T-junction crack whatever the heights. | A real place never streams, so it keeps its own finer mesh. |
| The wall-clock perf guard in `worldStream.test.ts` uses a deliberately generous threshold | It guards against someone re-inlining the placement loop, not a tight number; wall-clock timings do not port across CI machines — a tight one blocked deploys. | — |

Still open: the constant load while standing still (nothing in the render
loop rebuilds or loops unboundedly per frame — checked), a mobile quality
tier, and instancing mushrooms (a design call: finite shapes vs "no two
alike").

## 2. The frozen loading screen

Measured in headless Chrome on the demo wood: during the load, **2 frames**
rendered and one **9.6 s** freeze. `createForest` builds a mesh for every
find on the home plot in one synchronous loop — about 85% of the whole load.
The spinner is a `requestAnimationFrame` callback, so it cannot run; and the
overlay was closed before that loop, so the screen sat dark.

| Decision | Why |
|---|---|
| `createForest` can **defer** its finds (`deferPlacements`) and build them on request in budgeted slices; `main.ts` drains them in ~30 ms slices with a painted frame between | The same slicing idea the streamed chunks already use, one level up. Slicing must change nothing about the result: the wood built in slices equals the wood built at once. |
| `util/yield.ts`'s `yieldToPaint()` — rAF, then a macrotask; raced by a 100 ms timer | A background tab never fires rAF; a load that waits only on rAF would never finish there. Outside a browser it is one macrotask turn. |
| A new `grow` stage on the progress bar | The longest stage deserves its own label. |
| The loading overlay closes only **after the first rendered frame**, and shaders compile under it (`renderer.compileAsync`) | Otherwise the screen is dark between "done" and the first frame, and the first frame stalls on shader compiles. |
| `loadForestData` yields a frame before the tree/biome block | The other long synchronous stretch. |
| `wobbleCap` computes the cap noise once per angle, not once per vertex | Every ring of a lathe shares its angles; the noise was being recomputed per ring — free speed-up while profiling. |

## 3. Testing

- `instanceCulling`: the group names every builder uses; nothing collected
  from an unknown group; far instances zeroed, near untouched; exact
  restoration; buffer version bumped only on change; order-independent;
  `sweepAll` sweeps every culler.
- `worldStream`: placements arrive gradually; no `update()` exceeds the
  budget; seams continuous in height and colour.
- `createForest` deferred placements: nothing up front when deferred,
  everything on request; always makes progress even on a zero budget and
  drains in slices; ends with the same wood as building at once.
- `yieldToPaint`: resolves without rAF; resolves when rAF never fires;
  waits for a frame when there is one.
- Measure again in headless Chrome: frames rendered during the load and the
  worst pause, before and after.
