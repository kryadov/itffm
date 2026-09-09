import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Flattens a built collectible (mushroom, berry, or any future kind) into a
 * single mesh with baked vertex colours.
 *
 * A detailed model is several parts in several materials, and a wood holds
 * hundreds of them — over a thousand draw calls, which stalls even a fast GPU
 * and hangs a software one outright. In the world we do not need the parts to
 * be separately addressable, only to look right, so they are merged and their
 * colours baked into the vertices. The detailed group is still what the
 * inspection view and the encyclopedia build, because there the parts matter.
 *
 * Kind-agnostic: it only ever looks at each mesh's own geometry and material
 * colour, never at what the thing is a model of — mushroom/build.ts and every
 * other kind's build.ts share this one implementation.
 */
export function toWorldMesh(group: THREE.Group): THREE.Mesh {
  group.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []

  const paint = (geo: THREE.BufferGeometry, color: THREE.Color) => {
    const count = geo.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    // Merging needs identical attribute sets; a stray tangent or uv2 would
    // silently drop the part.
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name)
    }
    return geo
  }

  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const color = (mesh.material as THREE.MeshStandardMaterial).color

    const instanced = mesh as THREE.InstancedMesh
    if (instanced.isInstancedMesh) {
      const m = new THREE.Matrix4()
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, m)
        parts.push(paint(instanced.geometry.clone().applyMatrix4(m).applyMatrix4(mesh.matrixWorld), color))
      }
      return
    }
    parts.push(paint(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), color))
  })

  const merged = new THREE.Mesh(
    mergeGeometries(parts, false),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
  )
  merged.name = 'collectible'
  return merged
}

/** Floor on the radius of the invisible pick target `withPickHitbox` adds,
 *  metres — on the order of a small mushroom cap, the one thing in the wood
 *  the crosshair's exact ray already lands on reliably. A model taller or
 *  wider than this (a berry bush, say) gets a bigger sphere sized to its own
 *  real bounds instead — see `withPickHitbox` below for why a single fixed
 *  size stopped being enough. */
export const HITBOX_RADIUS = 0.12
/** Fully invisible (not merely transparent) — `colorWrite: false` means it
 *  never shows up even where it clips through something else. three.js's
 *  raycaster never looks at `visible` either way (verified against the
 *  installed three@0.169.0 source, node_modules/three/src/core/Raycaster.js
 *  — an earlier version of this comment claimed otherwise from memory and
 *  was wrong), so this could be `visible = false` just as validly; kept
 *  `visible: true` with a fully transparent, non-writing material instead
 *  so "does the raycaster skip hidden objects" is never a question that
 *  needs re-deciding here later. */
const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })

/**
 * Wraps a small collectible's real mesh with an invisible, generously-sized
 * sphere for the exact ray in `game/pick.ts` to hit — the same mechanism a
 * mushroom's own cap already satisfies just by being physically big enough.
 *
 * A single berry, nut or find is a few centimetres across in real life,
 * subtends only a few screen pixels at any reasonable distance, and the
 * crosshair's exact ray routinely missed it even when aimed "at" it by eye —
 * an earlier angular "forgiveness cone" fallback tried to patch this at the
 * aiming end instead and went through two more live bugs before it was
 * reliable even in principle (see TODO.md, 2026-09-09). Giving the small
 * object itself a real, exact-ray-sized target removes the need for a
 * second aiming code path altogether: it is picked up exactly the way a
 * mushroom is.
 *
 * The sphere is centred on the model's own bounding box, not the ground
 * point under it, and sized to that box rather than a single fixed radius —
 * a berry now grows a real, knee-high bush (berry/build.ts) to actually be
 * seen at all, and a fixed sphere sitting at ground level covered only the
 * bottom third of it, well below where a player looking at the bush itself
 * naturally aims (2026-09-09 live report, confirmed with `?debug=1`'s own
 * lateral-miss readout).
 */
export function withPickHitbox(mesh: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(mesh)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(HITBOX_RADIUS, size.length() / 2)
  const wrapper = new THREE.Group()
  wrapper.add(mesh)
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), HITBOX_MATERIAL)
  hitbox.position.copy(center)
  wrapper.add(hitbox)
  return wrapper
}
