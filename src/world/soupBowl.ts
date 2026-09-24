import * as THREE from 'three'
import { puffTexture } from './puff'

export interface SoupBowl {
  group: THREE.Group
  /** Drifts its steam — call every frame it is shown. */
  update(elapsed: number): void
}

/**
 * A bowl of ukha: a turned wooden bowl, the golden broth with a piece of
 * fish, potato and carrot in it, a spoon across the rim, and a little steam.
 * The same model on the hut's table and in your hands on the way there. Its
 * base sits at the origin; about 15 cm across.
 */
export function buildSoupBowl(): SoupBowl {
  const group = new THREE.Group()
  group.name = 'soupBowl'
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8, side: THREE.DoubleSide })
  const profile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 0), new THREE.Vector2(0.032, 0.004),
    new THREE.Vector2(0.06, 0.02), new THREE.Vector2(0.075, 0.045), new THREE.Vector2(0.07, 0.047),
    new THREE.Vector2(0.056, 0.024), new THREE.Vector2(0.0, 0.012),
  ]
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), bowlMat)
  bowl.name = 'bowl'
  group.add(bowl)
  const broth = new THREE.Mesh(
    new THREE.CircleGeometry(0.064, 16),
    new THREE.MeshStandardMaterial({ color: 0xd6a24a, roughness: 0.3 }),
  )
  broth.rotation.x = -Math.PI / 2
  broth.position.y = 0.036
  group.add(broth)
  const bits: [number, number, number, number][] = [
    [0xf2eadc, 0.018, -0.012, 0.014], [0xe8d8a0, -0.02, 0.016, 0.011], [0xe07a2a, 0.012, 0.024, 0.008], [0xe07a2a, -0.024, -0.016, 0.007],
  ]
  for (const [color, bx, bz, r] of bits) {
    const bit = new THREE.Mesh(new THREE.BoxGeometry(r * 2, r, r * 1.6), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
    bit.position.set(bx, 0.038, bz)
    bit.rotation.y = bx * 40
    group.add(bit)
  }
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.006, 0.014), bowlMat)
  spoon.position.set(0.03, 0.05, 0.02)
  spoon.rotation.set(0, 0.5, 0.12)
  group.add(spoon)
  const steam: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: puffTexture(), color: 0xf4f4f0, transparent: true, opacity: 0, depthWrite: false }),
    )
    sprite.userData.phase = i / 3
    group.add(sprite)
    steam.push(sprite)
  }
  const update = (elapsed: number): void => {
    for (const sprite of steam) {
      const t = (elapsed * 0.3 + sprite.userData.phase) % 1
      sprite.position.set(Math.sin(t * 6 + sprite.userData.phase * 5) * 0.02, 0.05 + t * 0.25, 0)
      sprite.scale.setScalar(0.03 + t * 0.08)
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - t) * Math.min(1, t * 6)
    }
  }
  return { group, update }
}
