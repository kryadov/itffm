import * as THREE from 'three'

/**
 * Real distance culling for static `THREE.InstancedMesh` scatter — see
 * TODO.md's "…но БЕЗ отсечения по дальности". `THREE.Fog` only hides distant
 * trees/boulders/undergrowth/flora/grass visually: it is a shader effect
 * applied to whatever the GPU already rasterized, not a reason to skip
 * drawing them, and the sky dome (`world/sky.ts`) is 1500m across — every
 * instance inside it is drawn every frame regardless of the fog's own
 * 30–140m fade. Only mushrooms (`main.ts`'s `cullDistantMushrooms`) were
 * ever actually skipped.
 *
 * `THREE.InstancedMesh` has no cheap way to drop an individual instance from
 * a draw call — the buffer would have to be rebuilt, which costs more than
 * the triangles it would save if done every frame. The trick used here
 * instead: an instance beyond the cull radius gets its own matrix scaled to
 * zero (degenerate, draws nothing, same draw call, same buffer) and restored
 * to its real transform the moment it's back in range. `sweep()` is meant to
 * be called periodically (every several dozen frames), not every frame — it
 * always recomputes from the current camera position rather than
 * accumulating any state across calls, so calling it less often only means
 * a culled/uncovered instance takes a little longer to flip, never a wrong
 * answer.
 */

/** Which top-level group names hold static (non-animated) instanced scatter
 *  built once and left alone — see world/trees.ts, boulders.ts, deadwood.ts,
 *  undergrowth.ts, flora.ts, grass.ts, each of which names its own
 *  `THREE.Group` exactly this. Deliberately excludes birds/critters/insects
 *  — those are InstancedMesh too, but re-pose themselves every frame from
 *  their own animation state, and zeroing an instance's matrix here would
 *  just be overwritten (or fight) their own per-frame `setMatrixAt` calls. */
export const STATIC_SCATTER_GROUP_NAMES: ReadonlySet<string> = new Set([
  'trees', 'boulders', 'deadwood', 'leaning-trees', 'undergrowth', 'flora', 'grass',
])

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0)

interface CullBatch {
  mesh: THREE.InstancedMesh
  /** Each instance's real transform, captured once when the batch is first
   *  collected — restoring a culled instance needs this exact matrix back,
   *  not a recomputed one (rotation/scale vary per instance, not just
   *  position). */
  base: THREE.Matrix4[]
  x: Float32Array
  z: Float32Array
  /** Per-instance cull state as of the last sweep, so a sweep only touches
   *  (and flags `needsUpdate` for) instances that actually changed side. */
  culled: Uint8Array
}

export interface ScatterCuller {
  /** Total instances tracked across every batch in this group — for tests
   *  and the debug overlay, not needed by the sweep itself. */
  readonly instanceCount: number
  /** Recomputes which instances are farther than `radius` from (camX, camZ)
   *  and flips only the ones that changed side since the last sweep. Safe to
   *  call at any rate — always recomputes fresh from the given position
   *  rather than integrating anything, so a slower call rate only delays how
   *  quickly a newly-far/newly-near instance catches up, never produces a
   *  wrong answer. */
  sweep(camX: number, camZ: number, radius: number): void
}

function collectBatch(mesh: THREE.InstancedMesh): CullBatch {
  const n = mesh.count
  const base: THREE.Matrix4[] = new Array(n)
  const x = new Float32Array(n)
  const z = new Float32Array(n)
  const m = new THREE.Matrix4()
  for (let i = 0; i < n; i++) {
    mesh.getMatrixAt(i, m)
    base[i] = m.clone()
    x[i] = m.elements[12]
    z[i] = m.elements[14]
  }
  return { mesh, base, x, z, culled: new Uint8Array(n) }
}

/**
 * Walks `root`'s direct children for any named in `STATIC_SCATTER_GROUP_NAMES`
 * and snapshots every `THREE.InstancedMesh` under each into its own
 * `ScatterCuller` — one call, right after a wood (or a streamed chunk) is
 * fully built and its scatter meshes already carry their real, final
 * per-instance transforms. `game/scene.ts`'s home plot calls this once;
 * `game/worldStream.ts` calls it once per chunk, right after that chunk's own
 * group is built.
 */
export function collectScatterCullers(root: THREE.Object3D): ScatterCuller[] {
  const cullers: ScatterCuller[] = []
  for (const child of root.children) {
    if (!STATIC_SCATTER_GROUP_NAMES.has(child.name)) continue
    const batches: CullBatch[] = []
    child.traverse((obj) => {
      if ((obj as THREE.InstancedMesh).isInstancedMesh) batches.push(collectBatch(obj as THREE.InstancedMesh))
    })
    if (batches.length === 0) continue
    cullers.push({
      instanceCount: batches.reduce((sum, b) => sum + b.x.length, 0),
      sweep(camX, camZ, radius) {
        const limit = radius * radius
        for (const b of batches) {
          let changed = false
          for (let i = 0; i < b.x.length; i++) {
            const dx = b.x[i] - camX
            const dz = b.z[i] - camZ
            const shouldCull = (dx * dx + dz * dz > limit ? 1 : 0) as 0 | 1
            if (b.culled[i] === shouldCull) continue
            b.culled[i] = shouldCull
            b.mesh.setMatrixAt(i, shouldCull ? ZERO_SCALE : b.base[i])
            changed = true
          }
          if (changed) b.mesh.instanceMatrix.needsUpdate = true
        }
      },
    })
  }
  return cullers
}

/** Sweeps every culler in the list — a small convenience for callers holding
 *  one flat array (game/scene.ts's home plot) rather than a map of chunks. */
export function sweepAll(cullers: ScatterCuller[], camX: number, camZ: number, radius: number): void {
  for (const c of cullers) c.sweep(camX, camZ, radius)
}
