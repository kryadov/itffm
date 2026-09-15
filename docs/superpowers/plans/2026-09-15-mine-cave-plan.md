# Mine as a Real Cave — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mine's single straight tunnel into a small branching cave — a
sloped entrance, an asymmetric mouth, several forks with dead ends, one true
path to a diamond chamber — and give the diamond a rougher, asymmetric gem
shape that visibly glows under the player's own lamp.

**Architecture:** `Mine` gains a `segments` tree generated once, deterministically,
inside `placeMine` (same `mulberry32(seed)` convention as the rest of the
project). `mineObstacles`, `isInsideMine`, `diamondSpotInMine` and
`buildMineMesh` all walk that same tree instead of assuming one segment, so
mesh and collision can never disagree. The diamond's own shape and its glow
are unrelated to the cave graph — a fixed jittered `IcosahedronGeometry` and a
per-frame `emissiveIntensity` update in `main.ts`'s existing animation loop.

**Tech Stack:** TypeScript, three.js (`BufferGeometry`, `MeshStandardMaterial`),
vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-mine-cave-design.md`

## Global Constraints

- No `Math.random` anywhere in `src/` — every generator draws from
  `mulberry32` (`src/util/rng.ts`), and every generator has a test asserting
  one seed gives one result.
- `src/world/mine.ts` stays a pure-core module: no import from `game`/`ui`.
- `mineObstacles`, `isInsideMine`, `diamondSpotInMine` keep their existing
  call signatures — `quest/lamp.ts`, `quest/placement.ts`, `game/player.ts`,
  `main.ts` all call them today and must not need changes beyond what each
  task states.
- One commit per task (see repo's own CLAUDE.md TDD convention).

---

### Task 1: `Mine` becomes a segment tree

**Files:**
- Modify: `src/world/mine.ts` (the `Mine` interface, `placeMine`'s tail end,
  keep everything above "compute `bestHeading`" as-is)
- Test: `test/world/mine.test.ts`

**Interfaces:**
- Produces:
  - `interface MineSegment { id: number; parentId: number | null; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; width: number; isLeaf: boolean; isDiamondChamber: boolean }`
  - `interface Mine { x: number; z: number; y: number; heading: number; segments: MineSegment[]; reach: number }` (replaces today's flat `Mine`)
  - `placeMine(...)` — same params as today, now also builds `segments`/`reach`.

- [ ] **Step 1: Write the failing tests**

Add to `test/world/mine.test.ts`, in a new `describe('mine segment graph', ...)`
block (after the existing `describe('placeMine', ...)` block):

```ts
describe('mine segment graph', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }

  it('has one root segment starting at the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const root = m.segments.find((s) => s.parentId === null)
    expect(root).toBeDefined()
    expect(root!.x0).toBe(0)
    expect(root!.z0).toBe(0)
  })

  it('slopes the root segment down from the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const root = m.segments.find((s) => s.parentId === null)!
    expect(root.y0).toBe(0)
    expect(root.y1).toBeLessThan(0)
  })

  it('every non-root segment continues exactly where its parent ends', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    for (const s of m.segments) {
      if (s.parentId === null) continue
      const parent = m.segments.find((p) => p.id === s.parentId)!
      expect(s.x0).toBeCloseTo(parent.x1, 6)
      expect(s.z0).toBeCloseTo(parent.z1, 6)
      expect(s.y0).toBeCloseTo(parent.y1, 6)
    }
  })

  it('has exactly one diamond chamber, and every other leaf is a dead end', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const leaves = m.segments.filter((s) => s.isLeaf)
    const chambers = leaves.filter((s) => s.isDiamondChamber)
    expect(chambers.length).toBe(1)
    expect(leaves.length).toBeGreaterThanOrEqual(4) // 1 + BRANCH_COUNT, BRANCH_COUNT is 3 or 4
    expect(leaves.length).toBeLessThanOrEqual(5)
  })

  it('is deterministic for the same seed', () => {
    const a = placeMine(flat, 90, 11, [], shelter, [{ x: 0, z: 0 }])
    const b = placeMine(flat, 90, 11, [], shelter, [{ x: 0, z: 0 }])
    expect(a.segments).toEqual(b.segments)
  })

  it('gives a different graph for a different seed', () => {
    const a = placeMine(flat, 90, 1, [], shelter, [{ x: 0, z: 0 }])
    const b = placeMine(flat, 90, 2, [], shelter, [{ x: 0, z: 0 }])
    expect(a.segments).not.toEqual(b.segments)
  })

  it('reach covers the farthest segment endpoint from the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const farthest = Math.max(...m.segments.map((s) => Math.hypot(s.x1, s.z1)))
    expect(m.reach).toBeCloseTo(farthest, 6)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mine`
Expected: FAIL — `m.segments` is `undefined` (the type doesn't exist yet).

- [ ] **Step 3: Implement the segment tree generator**

Replace the `Mine` interface and add the generator in `src/world/mine.ts`.
Keep everything from the top of the file down through the `HEADING_CANDIDATES`
loop inside `placeMine` untouched — only the `Mine` interface and the `return`
statement at the end of `placeMine` change:

```ts
export interface MineSegment {
  id: number
  /** null for the entrance/root segment. */
  parentId: number | null
  /** Local start/end, metres, before `Mine.heading`'s rotation — the same
   *  local frame `localToWorld` already rotates as one piece. */
  x0: number
  z0: number
  x1: number
  z1: number
  /** Floor height relative to the entrance. Only the root segment slopes
   *  (y0 = 0, y1 < 0); every other segment continues flat from its parent's
   *  own y1, matching the "goes down once, at the mouth" brief. */
  y0: number
  y1: number
  width: number
  /** No children — closed by a back wall (mineObstacles/buildMineMesh both
   *  read this instead of assuming the single old dead end). */
  isLeaf: boolean
  /** True for exactly one leaf: the far end of the one path that actually
   *  leads to the diamond, per the branching cave design
   *  (docs/superpowers/specs/2026-09-15-mine-cave-design.md §1). */
  isDiamondChamber: boolean
}

export interface Mine {
  x: number
  z: number
  /** Ground height at the entrance itself. */
  y: number
  /** Radians the cave bores away from the entrance, 0 along +x. */
  heading: number
  /** The cave's own branching graph — see MineSegment. Always has at least
   *  one segment (the entrance ramp), even with zero forks. */
  segments: MineSegment[]
  /** Farthest straight-line distance, in local metres, from the entrance to
   *  any point in the graph — isInsideMine's own "is it dark here" radius. */
  reach: number
}
```

Now add the generator (new private constants and function), placed right
after the existing `HEADING_CANDIDATES` constant block and before `placeMine`:

```ts
/** Root segment: length of the sloped entrance ramp, metres. */
const RAMP_LENGTH_RANGE: [number, number] = [4, 5.5]
/** How far the floor drops over the ramp, metres — "goes down once, at the
 *  mouth," per the design doc, not a staircase. */
const RAMP_DROP_RANGE: [number, number] = [1.5, 2]
/** How many forks the whole tree gets — leaves end up at 1 + this. */
const BRANCH_COUNT_RANGE: [number, number] = [3, 5] // randRange's max is exclusive-ish via floor below
const CHILD_LENGTH_RANGE: [number, number] = [3, 6]
/** Half-angle, radians, each of a fork's two children turns away from the
 *  parent's own heading — wide enough that the two forks read as genuinely
 *  different directions, not a barely-there kink. */
const FORK_TURN_RANGE: [number, number] = [0.5, 0.95]
const CHILD_WIDTH_FACTOR_RANGE: [number, number] = [0.85, 1.15]
/** The diamond chamber's own leaf gets wider on its last third — a small
 *  room, not just a wider corridor. */
const CHAMBER_WIDTH_FACTOR = 1.6

function buildMineGraph(rng: () => number): MineSegment[] {
  const root: MineSegment = {
    id: 0,
    parentId: null,
    x0: 0,
    z0: 0,
    x1: randRange(rng, RAMP_LENGTH_RANGE),
    z1: 0,
    y0: 0,
    y1: -randRange(rng, RAMP_DROP_RANGE),
    width: TUNNEL_WIDTH,
    isLeaf: true,
    isDiamondChamber: false,
  }
  const segments: MineSegment[] = [root]
  let openLeaves = [root]
  let nextId = 1

  const branchCount = Math.floor(randRange(rng, BRANCH_COUNT_RANGE))
  for (let i = 0; i < branchCount; i++) {
    const parent = openLeaves[Math.floor(rng() * openLeaves.length)]
    parent.isLeaf = false
    const parentAngle = Math.atan2(parent.z1 - parent.z0, parent.x1 - parent.x0)
    const children: MineSegment[] = []
    for (const sign of [1, -1]) {
      const angle = parentAngle + sign * randRange(rng, FORK_TURN_RANGE)
      const length = randRange(rng, CHILD_LENGTH_RANGE)
      const child: MineSegment = {
        id: nextId++,
        parentId: parent.id,
        x0: parent.x1,
        z0: parent.z1,
        x1: parent.x1 + Math.cos(angle) * length,
        z1: parent.z1 + Math.sin(angle) * length,
        y0: parent.y1,
        y1: parent.y1,
        width: TUNNEL_WIDTH * randRange(rng, CHILD_WIDTH_FACTOR_RANGE),
        isLeaf: true,
        isDiamondChamber: false,
      }
      segments.push(child)
      children.push(child)
    }
    openLeaves = openLeaves.filter((s) => s.id !== parent.id).concat(children)
  }

  const chamber = openLeaves[Math.floor(rng() * openLeaves.length)]
  chamber.isDiamondChamber = true
  chamber.width *= CHAMBER_WIDTH_FACTOR

  return segments
}
```

Then change `placeMine`'s own ending. Today it ends with:

```ts
  return { x, z, y: here, heading: bestHeading }
```

Replace with:

```ts
  const graph = buildMineGraph(mulberry32((seed + 0x9e3779b1) >>> 0))
  const reach = Math.max(...graph.map((s) => Math.hypot(s.x1, s.z1)))
  return { x, z, y: here, heading: bestHeading, segments: graph, reach }
```

(The `+ 0x9e3779b1` offset keeps the graph's own random stream independent of
the heading/entrance-siting RNG above it in the same function, the same
pattern `game/scene.ts` already uses for its own derived seeds like
`seed + 15`, `seed + 20` — just a golden-ratio-ish constant since this one
doesn't need to be small/readable.)

`randRange` and `mulberry32` are already imported at the top of the file —
confirm the import line reads:

```ts
import { mulberry32, randRange } from '../util/rng'
```

(if `randRange` isn't already imported, add it to that line).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mine`
Expected: PASS for every test in `mine segment graph`, and the pre-existing
`placeMine` tests still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/world/mine.ts test/world/mine.test.ts
git commit -m "feat: generate the mine as a branching segment graph"
```

---

### Task 2: `mineObstacles` walks every segment

**Files:**
- Modify: `src/world/mine.ts`
- Test: `test/world/mine.test.ts`

**Interfaces:**
- Consumes: `Mine.segments` (Task 1), `MineSegment` fields.
- Produces: `mineObstacles(m: Mine): CircleObstacle[]` — same signature as
  today.

- [ ] **Step 1: Write the failing test**

Replace the existing `describe('mineObstacles', ...)` block in
`test/world/mine.test.ts` with:

```ts
describe('mineObstacles', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }

  it('gives side obstacles for every segment, plus a back wall on every leaf', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const obstacles = mineObstacles(m)
    // At least two side circles per segment (one per side, at minimum the
    // segment's own start) plus a closed end on every leaf.
    expect(obstacles.length).toBeGreaterThanOrEqual(m.segments.length * 2)
    const leafCount = m.segments.filter((s) => s.isLeaf).length
    // A crude but effective proxy for "every leaf actually got a back wall":
    // there are more distinct obstacle ids/positions than side-only would
    // produce. Concretely, redoing the graph with all leaves removed (an
    // impossible mutation here) isn't available, so instead assert the
    // count scales with leafCount by comparing against a version of the
    // same mine with one fewer... — simplest robust check: every leaf
    // segment's own endpoint has at least one obstacle within WALL width of
    // it (i.e. the dead end is actually closed).
    for (const s of m.segments) {
      if (!s.isLeaf) continue
      const nearEnd = obstacles.filter((o) => Math.hypot(o.x - s.x1, o.z - s.z1) <= s.width)
      expect(nearEnd.length).toBeGreaterThan(0)
    }
    void leafCount
  })

  it('is deterministic', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 2, z: -3 }])
    expect(mineObstacles(m)).toEqual(mineObstacles(m))
  })

  it('places every obstacle within reach of the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    for (const o of mineObstacles(m)) {
      expect(Math.hypot(o.x - m.x, o.z - m.z)).toBeLessThanOrEqual(m.reach + m.segments[0].width)
    }
  })
})
```

(This replaces the old test that assumed a single `+x` corridor — the graph
can bend any direction, so the old min/max-x assertions no longer hold.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mine`
Expected: FAIL — `mineObstacles` still assumes a single straight segment, so
leaves other than the original one aren't closed and the shape doesn't match.

- [ ] **Step 3: Implement**

Replace `mineObstacles` in `src/world/mine.ts`:

```ts
/**
 * The cave's own collision: two side walls running each segment's own
 * length, plus a back wall closing every leaf's far end — every dead end
 * and the diamond chamber alike are closed, only the graph's shape (Task 1)
 * decides where those ends are.
 */
export function mineObstacles(m: Mine): CircleObstacle[] {
  const out: CircleObstacle[] = []

  for (const seg of m.segments) {
    const dx = seg.x1 - seg.x0
    const dz = seg.z1 - seg.z0
    const length = Math.hypot(dx, dz) || 1
    const dirX = dx / length
    const dirZ = dz / length
    const perpX = -dirZ
    const perpZ = dirX
    const half = seg.width / 2

    const sideSteps = Math.ceil(length / WALL_CIRCLE_SPACING)
    for (let i = 0; i <= sideSteps; i++) {
      const t = i / sideSteps
      const lx = seg.x0 + dx * t
      const lz = seg.z0 + dz * t
      out.push({ ...localToWorld(m, lx + perpX * half, lz + perpZ * half), radius: WALL_CIRCLE_RADIUS })
      out.push({ ...localToWorld(m, lx - perpX * half, lz - perpZ * half), radius: WALL_CIRCLE_RADIUS })
    }

    if (seg.isLeaf) {
      const backSteps = Math.ceil(seg.width / WALL_CIRCLE_SPACING)
      for (let i = 0; i <= backSteps; i++) {
        const s = -half + (i / backSteps) * seg.width
        out.push({ ...localToWorld(m, seg.x1 + perpX * s, seg.z1 + perpZ * s), radius: WALL_CIRCLE_RADIUS })
      }
    }
  }

  return out
}
```

`localToWorld` above it stays exactly as-is — it already takes an arbitrary
local `(lx, lz)`, which is all this needs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/mine.ts test/world/mine.test.ts
git commit -m "feat: generalize mine collision to the whole segment graph"
```

---

### Task 3: `isInsideMine` uses `reach`

**Files:**
- Modify: `src/world/mine.ts`
- Test: `test/world/mine.test.ts`

**Interfaces:**
- Consumes: `Mine.reach` (Task 1).
- Produces: `isInsideMine(m: Mine, x: number, z: number): boolean` — same
  signature as today.

- [ ] **Step 1: Write the failing test**

Replace the existing `describe('isInsideMine', ...)` block with:

```ts
describe('isInsideMine', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }
  const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])

  it('is true right at the entrance', () => {
    expect(isInsideMine(m, 0, 0)).toBe(true)
  })

  it('is true at the farthest point the graph actually reaches', () => {
    const farthest = m.segments.reduce((best, s) =>
      Math.hypot(s.x1, s.z1) > Math.hypot(best.x1, best.z1) ? s : best,
    )
    const world = { x: m.x + farthest.x1, z: m.z + farthest.z1 } // heading is 0 in this fixture
    expect(isInsideMine(m, world.x, world.z)).toBe(true)
  })

  it('is false well outside the whole graph', () => {
    expect(isInsideMine(m, m.reach * 5, m.reach * 5)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mine`
Expected: FAIL on the "farthest point" case — today's fixed `TUNNEL_LENGTH`
threshold is shorter than a graph with a couple of forks actually reaches.

- [ ] **Step 3: Implement**

Replace `isInsideMine`:

```ts
/**
 * Whether a point is close enough to this mine's own graph to count as
 * "inside" for the lamp's own on/off rule (`quest/lamp.ts`'s `lampIsOn`) — a
 * plain distance check against the graph's own reach (Task 1), not a
 * precise inside-the-tunnel test: the honest reading of "you're at the
 * mine, it's dark in there" stays the same as the original single-corridor
 * version, just sized to whatever the graph turned out to be this world.
 */
export function isInsideMine(m: Mine, x: number, z: number): boolean {
  return Math.hypot(x - m.x, z - m.z) <= m.reach
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/mine.ts test/world/mine.test.ts
git commit -m "fix: size isInsideMine to the whole cave graph, not one fixed length"
```

---

### Task 4: `diamondSpotInMine` finds the diamond chamber leaf

**Files:**
- Modify: `src/world/mine.ts`
- Test: `test/world/mine.test.ts`

**Interfaces:**
- Consumes: `Mine.segments`, `MineSegment.isDiamondChamber` (Task 1).
- Produces: `diamondSpotInMine(m: Mine): { x: number; y: number; z: number }`
  — same signature as today.

- [ ] **Step 1: Write the failing test**

Replace the existing `describe('diamondSpotInMine', ...)` block with:

```ts
describe('diamondSpotInMine', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }

  it('sits inside the cave, not at or beyond the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const spot = diamondSpotInMine(m)
    expect(isInsideMine(m, spot.x, spot.z)).toBe(true)
    expect(Math.hypot(spot.x - m.x, spot.z - m.z)).toBeGreaterThan(1)
  })

  it('sits in the segment marked as the diamond chamber', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const chamber = m.segments.find((s) => s.isDiamondChamber)!
    const spot = diamondSpotInMine(m)
    // heading is 0 in this fixture, so world == local here.
    const alongChamber = Math.hypot(spot.x - chamber.x0, spot.z - chamber.z0)
    const chamberLength = Math.hypot(chamber.x1 - chamber.x0, chamber.z1 - chamber.z0)
    expect(alongChamber).toBeLessThanOrEqual(chamberLength + 1e-6)
    expect(alongChamber).toBeGreaterThan(chamberLength * 0.5)
  })

  it('is deterministic', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(diamondSpotInMine(m)).toEqual(diamondSpotInMine(m))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mine`
Expected: FAIL — today's version reads a fixed `TUNNEL_LENGTH * 0.85` offset
along local `+x`, unrelated to the graph.

- [ ] **Step 3: Implement**

Replace `diamondSpotInMine`:

```ts
/** Where the diamond quest item sits: near the far end of the one leaf
 *  marked `isDiamondChamber` (Task 1), off to one side rather than dead
 *  centre — found the same way as everything else back there, not lit for
 *  you. */
export function diamondSpotInMine(m: Mine): { x: number; y: number; z: number } {
  const chamber = m.segments.find((s) => s.isDiamondChamber)!
  const dx = chamber.x1 - chamber.x0
  const dz = chamber.z1 - chamber.z0
  const length = Math.hypot(dx, dz) || 1
  const dirX = dx / length
  const dirZ = dz / length
  const perpX = -dirZ
  const perpZ = dirX
  const along = length * 0.85
  const across = chamber.width * 0.28
  const lx = chamber.x0 + dirX * along + perpX * across
  const lz = chamber.z0 + dirZ * along + perpZ * across
  const { x, z } = localToWorld(m, lx, lz)
  return { x, y: m.y + chamber.y1, z }
}
```

(The `y: m.y + chamber.y1` addition — today's version always used `m.y`
since the old single segment never sloped; now the chamber may sit below the
entrance, so the diamond's height needs to follow.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/mine.ts test/world/mine.test.ts
git commit -m "feat: place the diamond in the graph's own diamond-chamber leaf"
```

---

### Task 5: `buildMineMesh` renders the whole graph, sloped and jittered

**Files:**
- Modify: `src/world/mine.ts`
- Test: `test/world/mine.test.ts`

**Interfaces:**
- Consumes: `Mine.segments`, `MineSegment` fields (Task 1).
- Produces: `buildMineMesh(m: Mine): THREE.Group` — same signature as today.

This task replaces the box-per-wall approach with one hand-built
`BufferGeometry` per segment (floor + ceiling + two side walls, plus a back
wall on leaves), because a real slope and arbitrary turn angles need actual
quads, not axis-aligned boxes. It also adds the deformed, asymmetric
entrance mouth.

- [ ] **Step 1: Write the failing test**

Add to `test/world/mine.test.ts`, replacing the existing
`describe('buildMineMesh', ...)` block:

```ts
describe('buildMineMesh', () => {
  const flat: ElevationProvider = { heightAt: () => 0 }

  it('keeps the lantern deliberately dim — the interior must read as dark without the lamp', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const group = buildMineMesh(m)
    let lantern: THREE.PointLight | null = null
    group.traverse((o) => {
      if (o instanceof THREE.PointLight) lantern = o
    })
    expect(lantern).not.toBeNull()
    expect(lantern!.intensity).toBeLessThan(1)
  })

  it('builds one mesh group per segment, not just the first', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const group = buildMineMesh(m)
    let meshCount = 0
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) meshCount++
    })
    // Every segment contributes at least 3 meshes (floor, ceiling, one
    // combined side-walls-and-cap piece at minimum) — this just needs to
    // scale with segment count, not hit an exact number.
    expect(meshCount).toBeGreaterThanOrEqual(m.segments.length * 3)
  })

  it('is deterministic in its own right (vertex jitter included)', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    const a = buildMineMesh(m)
    const b = buildMineMesh(m)
    const posA: number[] = []
    const posB: number[] = []
    a.traverse((o) => {
      if (o instanceof THREE.Mesh) posA.push(...(o.geometry.getAttribute('position').array as Float32Array))
    })
    b.traverse((o) => {
      if (o instanceof THREE.Mesh) posB.push(...(o.geometry.getAttribute('position').array as Float32Array))
    })
    expect(posA).toEqual(posB)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mine`
Expected: FAIL — today's `buildMineMesh` only ever renders the one implicit
segment.

- [ ] **Step 3: Implement**

Replace `buildMineMesh` entirely in `src/world/mine.ts`. First add the small
geometry constants near the top (next to `WALL_THICKNESS`):

```ts
/** How much a wall/floor/ceiling vertex can wander off its ideal position,
 *  metres — small enough to stay well inside WALL_CIRCLE_RADIUS's own
 *  margin from the collision circles (Task 2), so the rock can never visibly
 *  poke through where the player is told they can walk. */
const ROCK_JITTER = 0.06
```

Then replace `buildMineMesh`:

```ts
/** One deterministic jitter stream for the cave's own rock texture — always
 *  the same regardless of how many forks the graph happened to grow this
 *  world, so changing BRANCH_COUNT_RANGE's own roll never changes how
 *  jittery the rock looks. Re-created fresh each call so buildMineMesh stays
 *  a pure function of `m` (the determinism test above relies on this). */
function jitterStream(m: Mine): () => number {
  return mulberry32((Math.round(m.x * 131) ^ Math.round(m.z * 733) ^ 0x2545f491) >>> 0)
}

/** A quad (two triangles) as a small standalone BufferGeometry, its four
 *  corners individually jittered by `rng` along both horizontal axes and
 *  vertically — used for every floor/ceiling/wall panel below so the cave
 *  reads as rough rock rather than flawless drywall. */
function jitteredQuad(
  rng: () => number,
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
): THREE.BufferGeometry {
  const jittered = corners.map((c) => {
    const j = () => (rng() * 2 - 1) * ROCK_JITTER
    return new THREE.Vector3(c.x + j(), c.y + j(), c.z + j())
  })
  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array([
    jittered[0].x, jittered[0].y, jittered[0].z,
    jittered[1].x, jittered[1].y, jittered[1].z,
    jittered[2].x, jittered[2].y, jittered[2].z,
    jittered[0].x, jittered[0].y, jittered[0].z,
    jittered[2].x, jittered[2].y, jittered[2].z,
    jittered[3].x, jittered[3].y, jittered[3].z,
  ])
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  return geom
}

function buildSegmentMeshes(seg: MineSegment, rng: () => number, mat: THREE.Material): THREE.Mesh[] {
  const dx = seg.x1 - seg.x0
  const dz = seg.z1 - seg.z0
  const length = Math.hypot(dx, dz) || 1
  const dirX = dx / length
  const dirZ = dz / length
  const perpX = -dirZ
  const perpZ = dirX
  const half = seg.width / 2

  const startL = new THREE.Vector3(seg.x0 + perpX * half, seg.y0, seg.z0 + perpZ * half)
  const startR = new THREE.Vector3(seg.x0 - perpX * half, seg.y0, seg.z0 - perpZ * half)
  const endL = new THREE.Vector3(seg.x1 + perpX * half, seg.y1, seg.z1 + perpZ * half)
  const endR = new THREE.Vector3(seg.x1 - perpX * half, seg.y1, seg.z1 - perpZ * half)
  const startLTop = startL.clone().setY(seg.y0 + TUNNEL_HEIGHT)
  const startRTop = startR.clone().setY(seg.y0 + TUNNEL_HEIGHT)
  const endLTop = endL.clone().setY(seg.y1 + TUNNEL_HEIGHT)
  const endRTop = endR.clone().setY(seg.y1 + TUNNEL_HEIGHT)

  const meshes: THREE.Mesh[] = [
    new THREE.Mesh(jitteredQuad(rng, [startR, startL, endL, endR]), mat), // floor
    new THREE.Mesh(jitteredQuad(rng, [startLTop, startRTop, endRTop, endLTop]), mat), // ceiling
    new THREE.Mesh(jitteredQuad(rng, [startL, startLTop, endLTop, endL]), mat), // left wall
    new THREE.Mesh(jitteredQuad(rng, [startRTop, startR, endR, endRTop]), mat), // right wall
  ]

  if (seg.isLeaf) {
    meshes.push(new THREE.Mesh(jitteredQuad(rng, [endR, endL, endLTop, endRTop]), mat)) // back wall
  }

  for (const mesh of meshes) {
    mesh.receiveShadow = true
  }
  return meshes
}

/** The entrance mouth's own decorative ring — an irregular polygon standing
 *  in the opening at the very start of the root segment, read as a jagged
 *  hole in the hillside rather than a rectangular doorway. Visual only: the
 *  entrance itself carries no collision today, on either side of this
 *  change. */
function buildEntranceDecoration(root: MineSegment, rng: () => number, mat: THREE.Material): THREE.Mesh {
  const half = root.width / 2
  const points = 8
  const positions: number[] = []
  const center = new THREE.Vector3(root.x0, root.y0 + TUNNEL_HEIGHT / 2, root.z0)
  const ring: THREE.Vector3[] = []
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    const rx = Math.cos(t) * half * 1.3
    const ry = Math.sin(t) * (TUNNEL_HEIGHT / 2 + half * 0.3)
    const wobble = 1 + (rng() * 2 - 1) * 0.35
    ring.push(new THREE.Vector3(root.x0, center.y + ry * wobble, root.z0 + rx * wobble))
  }
  for (let i = 0; i < points; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % points]
    positions.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geom.computeVertexNormals()
  return new THREE.Mesh(geom, mat)
}

/**
 * The cave's own geometry — every segment in `m.segments` gets a floor,
 * ceiling, two side walls, and (if it's a dead end or the diamond chamber) a
 * back wall, each panel a jittered quad (see `jitteredQuad`) for a rough,
 * asymmetric rock read rather than flawless boxes. The entrance gets its own
 * jagged decorative ring. One lantern near the diamond chamber, kept
 * deliberately dim — see the existing note this replaces. Built in the
 * mine's own local space and rotated as one piece by `m.heading`, same as
 * before.
 */
export function buildMineMesh(m: Mine): THREE.Group {
  const group = new THREE.Group()
  group.name = 'mine'
  group.position.set(m.x, m.y, m.z)
  group.rotation.y = -m.heading

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b564e, roughness: 1, flatShading: true })
  const rng = jitterStream(m)

  for (const seg of m.segments) {
    for (const mesh of buildSegmentMeshes(seg, rng, rockMat)) group.add(mesh)
  }
  const root = m.segments.find((s) => s.parentId === null)!
  group.add(buildEntranceDecoration(root, rng, rockMat))

  const chamber = m.segments.find((s) => s.isDiamondChamber)!
  const chamberDx = chamber.x1 - chamber.x0
  const chamberDz = chamber.z1 - chamber.z0
  const chamberLen = Math.hypot(chamberDx, chamberDz) || 1
  // A lantern near the diamond chamber, not the mouth, but deliberately dim
  // — a mine without the lamp quest owned has to read as genuinely dark
  // regardless of time of day (see
  // docs/superpowers/specs/2026-09-13-quest-items-design.md), so this is
  // barely more than a glint on the rock. What actually lights the interior
  // once the player has reason to see is the lamp quest's own PointLight on
  // the player (game/scene.ts's `updatePlayerLamp`), not this.
  const lantern = new THREE.PointLight(0xffb15c, 0.5, 4)
  lantern.position.set(
    chamber.x0 + (chamberDx / chamberLen) * chamberLen * 0.6,
    chamber.y1 + TUNNEL_HEIGHT * 0.6,
    chamber.z0 + (chamberDz / chamberLen) * chamberLen * 0.6,
  )
  lantern.castShadow = true
  lantern.shadow.mapSize.set(256, 256)
  lantern.shadow.bias = -0.002
  group.add(lantern)

  return group
}
```

Remove the now-unused `WALL_THICKNESS` constant if nothing else in the file
references it after this change (check with a search — `mineObstacles` never
used it, only the old `buildMineMesh` did).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mine`
Expected: PASS.

Then run the full suite to confirm nothing outside this file broke:

Run: `npm test`
Expected: PASS (in particular `test/quest/lamp.test.ts` and
`test/quest/placement.test.ts`, which call into `mine.ts`'s exports
transitively via fixtures — they use the same call signatures, untouched).

- [ ] **Step 5: Commit**

```bash
git add src/world/mine.ts test/world/mine.test.ts
git commit -m "feat: render the mine's whole cave graph with a sloped, jittered rock look"
```

---

### Task 6: An asymmetric, many-faceted diamond

**Files:**
- Modify: `src/main.ts:139` (the `DIAMOND_GEO` constant) and the
  `showQuestItem` function around `src/main.ts:399-413`
- Test: `test/main/diamondGeometry.test.ts` (new)

**Interfaces:**
- Produces: `jitterDiamondGeometry(seed: number): THREE.BufferGeometry`, a
  new small pure helper, plus `main.ts`'s own `DIAMOND_GEO` now built from it.

Rather than testing `main.ts` directly (it isn't structured for unit tests —
it boots the whole game), the jitter itself moves into a tiny testable
helper module, matching how every other procedural piece of this codebase
gets its own tested generator function.

- [ ] **Step 1: Write the failing test**

Create `src/mushroom/../world/diamondGem.ts`... — actually place it next to
the other small world-shape helpers: create `src/world/diamondGem.ts`:

```ts
// (empty for now — filled in Step 3)
```

Create `test/world/diamondGem.test.ts`:

```ts
import * as THREE from 'three'
import { jitterDiamondGeometry, DIAMOND_GEM_SEED } from '../../src/world/diamondGem'

describe('jitterDiamondGeometry', () => {
  it('has more faces than a plain octahedron', () => {
    const geom = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    const faceCount = (geom.getIndex()?.count ?? geom.getAttribute('position').count) / 3
    expect(faceCount).toBeGreaterThan(8)
  })

  it('is not perfectly symmetric — vertices at the same base radius end up at different actual radii', () => {
    const geom = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    const pos = geom.getAttribute('position')
    const radii = new Set<number>()
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i)
      radii.add(Math.round(v.length() * 1000))
    }
    expect(radii.size).toBeGreaterThan(1)
  })

  it('is deterministic for the same seed', () => {
    const a = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    const b = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- diamondGem`
Expected: FAIL — `src/world/diamondGem.ts` doesn't export anything yet.

- [ ] **Step 3: Implement**

Write `src/world/diamondGem.ts`:

```ts
import * as THREE from 'three'
import { mulberry32 } from '../util/rng'

/** Fixed seed for the diamond's own shape — this is the look of the item
 *  itself, the same in every wood, not part of any per-world procedural
 *  generation (see docs/superpowers/specs/2026-09-15-mine-cave-design.md
 *  §6). Still routed through mulberry32, not Math.random, so the shape is
 *  reproducible and testable like everything else generated in this
 *  project. */
export const DIAMOND_GEM_SEED = 0xd1a2013

/** How far a vertex's radius can wander from the base icosahedron radius,
 *  as a fraction of it — small enough the silhouette still reads as "gem,"
 *  large enough it's visibly not a regular solid. */
const RADIUS_JITTER = 0.22

/** A 20-faced base (three.js `IcosahedronGeometry`) with each vertex's own
 *  radius nudged by a deterministic amount, so the diamond in the mine
 *  reads as a rough-cut stone rather than a perfect symmetric solid. */
export function jitterDiamondGeometry(seed: number, radius = 0.16): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(radius, 0)
  const pos = geom.getAttribute('position')
  const rng = mulberry32(seed)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const factor = 1 + (rng() * 2 - 1) * RADIUS_JITTER
    v.multiplyScalar(factor)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}
```

Then in `src/main.ts`:

Replace the import block that currently imports from `./quest/lamp` (or any
nearby import line) by adding, near the top with the other `world/`
imports:

```ts
import { jitterDiamondGeometry, DIAMOND_GEM_SEED } from './world/diamondGem'
```

Replace line 139:

```ts
const DIAMOND_GEO = new THREE.OctahedronGeometry(0.18)
```

with:

```ts
const DIAMOND_GEO = jitterDiamondGeometry(DIAMOND_GEM_SEED)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- diamondGem`
Expected: PASS.

Run: `npm run build`
Expected: succeeds (confirms `main.ts`'s new import resolves and typechecks).

- [ ] **Step 5: Commit**

```bash
git add src/world/diamondGem.ts test/world/diamondGem.test.ts src/main.ts
git commit -m "feat: give the diamond a many-faceted, asymmetric cut"
```

---

### Task 7: The diamond glows under the player's lamp

**Files:**
- Modify: `src/main.ts` — `showQuestItem` (around line 399-413) and the
  animation loop's existing lamp block (around line 1048-1053)

**Interfaces:**
- Consumes: `questItemMeshes.diamond: THREE.Mesh | null` (already exists),
  `camera.position`, the existing `lampIsOn(...)` boolean already computed
  each frame.
- Produces: no new exports — purely wires up existing pieces.

- [ ] **Step 1: Manually verify today's baseline (no automated test — this
  is a per-frame visual material update in the game loop, which the project's
  own conventions leave to `boot-check`/screenshot verification, same as
  `game/scene.ts`'s lighting code has no unit test today)**

Run: `npm run dev`, walk to the mine, note the diamond currently looks like a
static grey/coloured stone regardless of the lamp.

- [ ] **Step 2: Give the diamond material an emissive base and keep a handle to it**

In `showQuestItem` (`src/main.ts` around line 399), change the material
construction so the diamond's own material is reachable later. Replace:

```ts
  function showQuestItem(id: QuestItemId): void {
    const isDiamond = id === 'diamond'
    const mesh = new THREE.Mesh(
      isDiamond ? DIAMOND_GEO : questItemGeo,
      new THREE.MeshStandardMaterial({
        color: QUEST_ITEM_COLOR[id],
        roughness: isDiamond ? 0.05 : 1,
        metalness: isDiamond ? 0.1 : 0,
      }),
    )
    const pos = quests[id].position
    mesh.position.set(pos.x, pos.y + (isDiamond ? 0.2 : 0.16), pos.z)
    forest.scene.add(mesh)
    questItemMeshes[id] = mesh
  }
```

with:

```ts
  function showQuestItem(id: QuestItemId): void {
    const isDiamond = id === 'diamond'
    const mesh = new THREE.Mesh(
      isDiamond ? DIAMOND_GEO : questItemGeo,
      new THREE.MeshStandardMaterial({
        color: QUEST_ITEM_COLOR[id],
        roughness: isDiamond ? 0.05 : 1,
        metalness: isDiamond ? 0.1 : 0,
        // Starts dark — updated every frame below (see the animation loop's
        // own lamp block) once the player's lamp is close enough to matter.
        emissive: isDiamond ? new THREE.Color(0x8fd8ff) : undefined,
        emissiveIntensity: 0,
      }),
    )
    const pos = quests[id].position
    mesh.position.set(pos.x, pos.y + (isDiamond ? 0.2 : 0.16), pos.z)
    forest.scene.add(mesh)
    questItemMeshes[id] = mesh
  }
```

- [ ] **Step 3: Drive `emissiveIntensity` from the existing lamp state**

In the animation loop, right after the existing block (around line
1048-1053):

```ts
    const clockT = timeFor(save.prefs.timeMode, cycleT)
    forest.updateDayNight(clockT, camera.position)
    forest.updatePlayerLamp(
      lampIsOn(quests.lamp.state === 'done', nightFactor(clockT), forest.playerInsideMine(player.x, player.z), lampOn),
      camera.position,
    )
```

add, immediately below it:

```ts
    const diamondMesh = questItemMeshes.diamond
    if (diamondMesh) {
      const lit = lampIsOn(
        quests.lamp.state === 'done', nightFactor(clockT), forest.playerInsideMine(player.x, player.z), lampOn,
      )
      const dist = diamondMesh.position.distanceTo(camera.position)
      // Fades in over the last 6m of the lamp's own reach, fully bright by
      // 1.5m — a glint you have to actually walk up to and be carrying a
      // lit lamp to see, matching the mine's own "genuinely dark otherwise"
      // rule (docs/superpowers/specs/2026-09-15-mine-cave-design.md §7).
      const closeness = lit ? Math.max(0, Math.min(1, (6 - dist) / (6 - 1.5))) : 0
      ;(diamondMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = closeness * 1.8
    }
```

(This recomputes `lit` rather than caching the earlier call's result,
because the earlier call is `void`-returning through `updatePlayerLamp` — an
intentionally cheap, pure re-evaluation of the same already-imported
`lampIsOn`, not a second source of truth.)

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, walk to the mine with the lamp quest not yet done (lamp
off) — diamond should look dark/inert. Complete the lamp quest, re-enter the
mine, walk up to the diamond chamber — the diamond should visibly brighten
as you approach, and dim again if you back away or turn the lamp off (`L`).

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: PASS (no test covers this per-frame branch directly, per the
project's own convention of leaving frame-loop visuals to manual/boot-check
verification — see Task 5's note).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: make the diamond glow when the player's lamp is close and lit"
```

---

### Task 8: Look at it, then close out FEATURES.md and the release

**Files:**
- Modify: `FEATURES.md` (per CLAUDE.md: update it in the same change
  whenever a feature is added or changed)
- Modify: `package.json` (version bump, per the repo's own release convention)

- [ ] **Step 1: Boot-check**

Run: `npm run build && npm run boot-check`
Expected: the bundle boots headless without hanging (this is the check that
has caught real black-screen regressions before — see CLAUDE.md).

- [ ] **Step 2: Silhouette sheet and a manual look**

Run: `npm run silhouette-sheet` and open the resulting PNG; separately run
`npm run dev`, walk into the mine, and actually look at:
- the entrance mouth reads as an irregular opening, not a rectangle;
- the floor visibly slopes down over the first few metres;
- at least one fork is visible/walkable, and at least one dead end actually
  dead-ends;
- the diamond chamber's rock looks rougher/less boxy than a plain corridor;
- the diamond itself looks like a many-faceted, slightly irregular gem, and
  visibly brightens as you approach it with the lamp lit.

Fix anything that reads as broken (per CLAUDE.md's "Look at it" — chimeric
proportions, a wall poking through the collision gap, a segment that visibly
doesn't connect to its parent) before moving on. Any fix here is a normal
edit + `npm test` + commit, not a new task.

- [ ] **Step 3: Update FEATURES.md**

Find the mine/diamond quest item's existing entry in `FEATURES.md` (search
for "mine" or "diamond") and rewrite it to describe the branching cave,
sloped entrance, and glowing gem in player-facing terms — following
whatever level of detail the surrounding entries already use.

- [ ] **Step 4: Bump the version and commit**

Check the current version:

```bash
grep '"version"' package.json
```

Bump the patch (or minor, matching whatever the repo's own recent tags did —
check `git tag --list | tail -5` for the pattern) in `package.json`, then:

```bash
git add FEATURES.md package.json
git commit -m "chore: the mine is now a small branching cave with a glowing diamond"
```

- [ ] **Step 5: Tag and push the release**

```bash
git push origin master
git tag vX.Y.Z
git push origin vX.Y.Z
```

(Replace `vX.Y.Z` with the version just set in `package.json`, matching the
existing `git tag vX.Y.Z && git push --tags` convention from CLAUDE.md.)

---

## Self-Review Notes

- Every task keeps `mineObstacles`, `isInsideMine`, `diamondSpotInMine`,
  `buildMineMesh`, `placeMine` at their existing call signatures — confirmed
  against every caller found in the codebase (`quest/lamp.ts`,
  `quest/placement.ts`, `game/player.ts`, `game/scene.ts`, `main.ts`).
- Task 6's diamond shape and Task 1-5's cave graph are independent — either
  can be implemented and tested without the other, so a reviewer can
  meaningfully accept one without the other.
- Task 7 depends on Task 6 only for `DIAMOND_GEO` already existing as a
  reachable constant — it does not depend on the graph tasks at all.
