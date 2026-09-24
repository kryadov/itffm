import * as THREE from 'three'

export interface HoneyJar {
  group: THREE.Group
  /** Empty, or full of honey. */
  setFull(full: boolean): void
}

/**
 * A glass jar with a cloth tied over its mouth — the honey quest's jar, the
 * same model on the hut's shelf, in your hand and under the quadcopter. Its
 * base sits at the origin; it is about 13 cm tall.
 */
export function buildHoneyJar(): HoneyJar {
  const group = new THREE.Group()
  group.name = 'honeyJar'
  const r = 0.045
  const h = 0.11

  const honey = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * 0.82, 14),
    new THREE.MeshStandardMaterial({ color: 0xd98e1c, roughness: 0.25, emissive: 0x4a2600, emissiveIntensity: 0.4 }),
  )
  honey.name = 'honey'
  honey.position.y = (h * 0.82) / 2 + 0.004
  group.add(honey)

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.96, h, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xdfeeea, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
    }),
  )
  glass.name = 'jarGlass'
  glass.position.y = h / 2
  group.add(glass)
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 16), glass.material)
  bottom.rotation.x = -Math.PI / 2
  bottom.position.y = 0.002
  group.add(bottom)

  // The cloth cover, tied down with string, its edge hanging a little.
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.9, side: THREE.DoubleSide })
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.25, 0.03, 16, 1, true), clothMat)
  cover.position.y = h - 0.008
  group.add(cover)
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 16), clothMat)
  top.rotation.x = -Math.PI / 2
  top.position.y = h + 0.007
  group.add(top)
  const string = new THREE.Mesh(
    new THREE.TorusGeometry(r * 1.07, 0.003, 4, 20),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1 }),
  )
  string.rotation.x = Math.PI / 2
  string.position.y = h - 0.006
  group.add(string)

  const setFull = (full: boolean): void => {
    honey.visible = full
  }
  setFull(false)
  return { group, setFull }
}
