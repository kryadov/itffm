import * as THREE from 'three'

/**
 * The crate the train leaves on a platform for whoever handed over the diamond:
 * a plain wooden crate with rope-bound lid and a paper label — the quadcopter
 * inside. Standing on y = 0, about 0.7 x 0.4 x 0.45 m.
 */
export function buildDroneCrate(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'droneCrate'
  const wood = new THREE.MeshStandardMaterial({ color: 0xa87b48, roughness: 1 })
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x8f6538, roughness: 1 })
  const strap = new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 0.9 })
  const paper = new THREE.MeshStandardMaterial({ color: 0xf1ead2, roughness: 1, side: THREE.DoubleSide })

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.36, 0.45), wood)
  body.position.y = 0.18
  group.add(body)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.49), darkWood)
  lid.position.y = 0.385
  group.add(lid)
  // Two bands round the crate, and slats on the sides.
  for (const x of [-0.22, 0.22]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.5), strap)
    band.position.set(x, 0.2, 0)
    group.add(band)
  }
  for (const y of [0.09, 0.27]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.46), darkWood)
    slat.position.y = y
    group.add(slat)
  }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), paper)
  label.name = 'label'
  label.position.set(0, 0.2, 0.232)
  group.add(label)
  return group
}
