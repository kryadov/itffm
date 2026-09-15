import * as THREE from 'three'

/**
 * Real-world-shaped models for the five quest items — shared by the mesh a
 * player picks up out in the wood (`main.ts`'s `showQuestItem`) and, for the
 * two that leave a trophy, the one `world/shelter.ts` displays once
 * delivered. One geometry per item, built once here, so the two can never
 * quietly drift apart the way two independent "good enough" primitives
 * would (live request, 2026-09-15: the pickup meshes read as unlabelled
 * coloured shapes, not the tools they are).
 *
 * Every model is built centred on its own local origin, standing as it
 * would rest on the ground — the caller positions, scales and (for the
 * rod/bike trophies) re-poses the returned group, none of that here.
 */

const WOOD_COLOR = 0x6b4a30
const METAL_COLOR = 0x8a8f96

/** A hand axe: a wooden haft with a wedge-shaped steel head near the top —
 *  the head a flattened, tapered box rather than a plain cube, so the
 *  silhouette reads as a blade and not a doorknob. */
export function buildAxeModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'axeModel'

  const haftMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.8 })
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.5, 8), haftMat)
  haft.position.y = 0.25
  group.add(haft)

  const headMat = new THREE.MeshStandardMaterial({ color: METAL_COLOR, roughness: 0.4, metalness: 0.6, flatShading: true })
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), headMat)
  head.name = 'head'
  head.rotation.z = -Math.PI / 2
  head.rotation.y = Math.PI / 4
  head.scale.set(1, 1, 0.45)
  head.position.set(0.05, 0.44, 0)
  group.add(head)

  return group
}

/** A hurricane lamp: a squat body, a warm glass chimney and a wire handle —
 *  the shape everyone already reads as "carried light," not just a coloured
 *  box. `chimneyMat` is returned too, so a caller can drive its own glow. */
export function buildLampModel(): { group: THREE.Group; chimneyMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group()
  group.name = 'lampModel'

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.5, metalness: 0.4 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10), bodyMat)
  base.position.y = 0.025
  group.add(base)

  const chimneyMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0, roughness: 0.3, transparent: true, opacity: 0.85, emissive: 0xffb84d, emissiveIntensity: 0,
  })
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 10), chimneyMat)
  chimney.name = 'chimney'
  chimney.position.y = 0.12
  group.add(chimney)

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.03, 10), bodyMat)
  cap.position.y = 0.205
  group.add(cap)

  const handleMat = bodyMat
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 12, Math.PI), handleMat)
  handle.position.y = 0.25
  handle.rotation.x = Math.PI / 2
  group.add(handle)

  return { group, chimneyMat }
}

/** A fishing rod: a tapered pole and a reel near the grip — pose (leaning,
 *  lying flat) is entirely the caller's own rotation on the returned group,
 *  same convention `buildBikeModel` follows. */
export function buildRodModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'rodModel'
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.7 })
  const rodPole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.5, 8), rodMat)
  rodPole.position.y = 0.75
  group.add(rodPole)
  const reelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.4 })
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), reelMat)
  reel.rotation.z = Math.PI / 2
  reel.position.set(0, 0.22, 0.015)
  group.add(reel)
  return group
}

/** A bicycle: two wheels, a frame and a handlebar, flat primitives only,
 *  same as everything else this project draws — see
 *  docs/superpowers/specs/2026-09-13-quest-items-design.md's own decision
 *  on the bike being a passive stat, never ridden or mounted. */
export function buildBikeModel(): THREE.Group {
  const bike = new THREE.Group()
  bike.name = 'bikeModel'
  const bikeMat = new THREE.MeshStandardMaterial({ color: 0x2f5f9e, roughness: 0.5, metalness: 0.3 })
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
  const wheelRadius = 0.33
  const wheelGeo = new THREE.TorusGeometry(wheelRadius, 0.025, 8, 20)
  const wheelSpan = 0.62
  for (const wx of [-wheelSpan / 2, wheelSpan / 2]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.y = Math.PI / 2
    wheel.position.set(wx, wheelRadius, 0)
    bike.add(wheel)
  }
  const frameGeoBike = new THREE.CylinderGeometry(0.014, 0.014, wheelSpan * 0.72, 6)
  const crossBar = new THREE.Mesh(frameGeoBike, bikeMat)
  crossBar.rotation.z = Math.PI / 2
  crossBar.position.set(0, wheelRadius * 1.35, 0)
  bike.add(crossBar)
  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), bikeMat)
  seatPost.position.set(-wheelSpan / 2 + 0.05, wheelRadius * 1.35 + 0.16, 0)
  bike.add(seatPost)
  const forkPost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), bikeMat)
  forkPost.rotation.z = -Math.PI * 0.12
  forkPost.position.set(wheelSpan / 2 - 0.04, wheelRadius * 1.55, 0)
  bike.add(forkPost)
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), bikeMat)
  handlebar.rotation.x = Math.PI / 2
  handlebar.position.set(wheelSpan / 2 + 0.02, wheelRadius * 1.35 + 0.19, 0)
  bike.add(handlebar)
  return bike
}
