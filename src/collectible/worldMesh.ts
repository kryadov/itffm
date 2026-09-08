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
