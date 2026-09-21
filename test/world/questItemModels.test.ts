import * as THREE from 'three'
import {
  buildAxeModel, buildLampModel, buildRodModel, buildBikeModel, buildBikeCockpitModel,
  buildRodPickupModel, layFlatOnGround, ROD_PICKUP_HALF_LENGTH,
} from '../../src/world/questItemModels'
import { ROLLING_RADIUS } from '../../src/game/bikeSteer'
import { TREAD_BLOCKS } from '../../src/world/questItemModels'

function meshCount(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) n++
  })
  return n
}

describe('buildAxeModel', () => {
  it('has a haft and a distinct head, not one plain shape', () => {
    const group = buildAxeModel()
    expect(meshCount(group)).toBeGreaterThanOrEqual(2)
    expect(group.getObjectByName('head')).toBeDefined()
  })
})

describe('buildLampModel', () => {
  it('has a chimney whose material the caller can drive independently', () => {
    const { group, chimneyMat } = buildLampModel()
    const chimney = group.getObjectByName('chimney') as THREE.Mesh
    expect(chimney).toBeDefined()
    expect(chimney.material).toBe(chimneyMat)
  })
})

describe('buildRodModel', () => {
  it('has a pole and a reel', () => {
    const group = buildRodModel()
    expect(meshCount(group)).toBeGreaterThanOrEqual(2)
  })
})

describe('buildBikeModel', () => {
  it('has two wheels plus a frame', () => {
    const group = buildBikeModel()
    expect(meshCount(group)).toBeGreaterThanOrEqual(5)
  })

  it('is a bike seen from the side: long along x, narrow across z, resting on the ground', () => {
    // The first version turned the wheels a quarter turn about y, so they stood
    // across the bike instead of along it and the whole thing read as two loose
    // rings (live report, 2026-09-19).
    const size = new THREE.Box3().setFromObject(buildBikeModel()).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(1.0)
    expect(size.z).toBeLessThan(size.x / 2)
    expect(size.y).toBeGreaterThan(0.8)
    expect(size.y).toBeLessThan(1.1)
  })

  it('has its wheels touching y = 0 and two of them, spaced a wheelbase apart', () => {
    const group = buildBikeModel()
    expect(new THREE.Box3().setFromObject(group).min.y).toBeCloseTo(0, 5)
    const wheels: THREE.Object3D[] = []
    group.traverse((c) => {
      if (c.name === 'wheel') wheels.push(c)
    })
    expect(wheels).toHaveLength(2)
    expect(Math.abs(wheels[0].position.x - wheels[1].position.x)).toBeGreaterThan(0.9)
  })
})

describe('buildBikeCockpitModel', () => {
  const bounds = (o: THREE.Object3D) => {
    o.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(o)
  }

  it('is the front end of the bike: a bar with grips, a fork and a front wheel', () => {
    const { group } = buildBikeCockpitModel()
    expect(group.getObjectByName('handlebar')).toBeDefined()
    expect(group.getObjectByName('wheel')).toBeDefined()
    const bike = new THREE.Box3().setFromObject(buildBikeModel())
    // Nothing of the rear half: it stops well short of the back wheel.
    expect(bounds(group).min.x).toBeGreaterThan(bike.min.x + 0.5)
  })

  it('turns the bar and the wheel together when steered, and back again', () => {
    const { group, steer } = buildBikeCockpitModel()
    const bar = group.getObjectByName('handlebar')!
    const wheel = group.getObjectByName('wheel')!
    // The bar's own long axis (along z, across the bike) in world space.
    const barAxis = () => new THREE.Vector3(0, 0, 1).applyQuaternion(bar.getWorldQuaternion(new THREE.Quaternion()))
    const straightAxis = barAxis()
    const wheelStraight = bounds(wheel).getSize(new THREE.Vector3())

    steer(0.5)
    group.updateMatrixWorld(true)
    // The bar swings round with the fork (its axis no longer runs straight
    // across); the wheel, seen edge-on until now, opens up across the bike
    // (its extent along z grows).
    expect(barAxis().distanceTo(straightAxis)).toBeGreaterThan(0.3)
    expect(bounds(wheel).getSize(new THREE.Vector3()).z).toBeGreaterThan(wheelStraight.z * 2)

    steer(0)
    group.updateMatrixWorld(true)
    expect(barAxis().distanceTo(straightAxis)).toBeLessThan(1e-6)
  })

  it('steers opposite ways for opposite angles', () => {
    const { group, steer } = buildBikeCockpitModel()
    const bar = group.getObjectByName('handlebar')!
    // Which way the bar's right-hand end swings along the bike's length (x).
    const swing = (a: number) => {
      steer(a)
      group.updateMatrixWorld(true)
      return new THREE.Vector3(0, 0, 1).applyQuaternion(bar.getWorldQuaternion(new THREE.Quaternion())).x
    }
    expect(swing(0.4) * swing(-0.4)).toBeLessThan(0)
  })
})

describe('buildRodPickupModel', () => {
  // A live report (2026-09-20): the rod lying in the wood was invisible while
  // its label showed. It was a 1-3 cm pole 2 cm off the ground, and a trail
  // ribbon (3 cm above the ground) buried nearly all of it.
  const box = () => new THREE.Box3().setFromObject(buildRodPickupModel())

  it('lies flat along x, as long as a rod', () => {
    const size = box().getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(1.4)
    expect(size.x).toBeLessThan(1.8)
    expect(size.z).toBeLessThan(0.25)
    expect(size.y).toBeLessThan(0.25)
  })

  it('is centred on its own origin along its length', () => {
    const b = box()
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0, 1)
    expect(-b.min.x).toBeCloseTo(ROD_PICKUP_HALF_LENGTH, 1)
  })

  it('clears a trail ribbon lying 3 cm above the ground, all along its length', () => {
    expect(box().min.y).toBeGreaterThanOrEqual(0.035)
  })

  it('stands proud of that ribbon by enough to read from a few metres', () => {
    const b = box()
    expect(b.max.y - 0.03).toBeGreaterThanOrEqual(0.06)
  })

  it('has a distinct reel and a handle, not one plain pole', () => {
    const group = buildRodPickupModel()
    let meshes = 0
    group.traverse((o) => { if (o instanceof THREE.Mesh) meshes++ })
    expect(meshes).toBeGreaterThanOrEqual(3)
    expect(group.getObjectByName('reel')).toBeDefined()
  })
})

describe('layFlatOnGround', () => {
  const HL = 0.75
  it('sits on flat ground at its height, level', () => {
    expect(layFlatOnGround(5, 5, HL, () => 2)).toEqual({ y: 2, pitch: 0 })
  })

  it('tilts to follow a slope along x, through the ground under both ends', () => {
    const c = layFlatOnGround(0, 0, HL, (x) => 0.2 * x)
    expect(c.pitch).toBeCloseTo(Math.atan(0.2), 6)
    expect(c.y).toBeCloseTo(0, 6)
  })

  it('does not tilt for a slope across it (along z)', () => {
    expect(layFlatOnGround(0, 0, HL, (_x, z) => 0.3 * z).pitch).toBe(0)
  })

  it('rides up over a bump in the middle instead of sinking into it', () => {
    const bump = (x: number) => (Math.abs(x) < 0.1 ? 0.2 : 0)
    expect(layFlatOnGround(0, 0, HL, bump).y).toBeCloseTo(0.2, 6)
  })

  it('is deterministic', () => {
    const h = (x: number, z: number) => Math.sin(x) + Math.cos(z)
    expect(layFlatOnGround(3, 4, HL, h)).toEqual(layFlatOnGround(3, 4, HL, h))
  })
})

describe('the bicycle wheel turns, and you can see it turn', () => {
  const wheelOf = (g: THREE.Object3D) => g.getObjectByName('wheel')!

  it('the cockpit can spin its front wheel about its own axle, leaving it where it is', () => {
    const { group, spin } = buildBikeCockpitModel()
    group.updateMatrixWorld(true)
    const before = wheelOf(group).getWorldPosition(new THREE.Vector3())
    const size = new THREE.Box3().setFromObject(wheelOf(group)).getSize(new THREE.Vector3())
    spin(1.3)
    group.updateMatrixWorld(true)
    expect(wheelOf(group).rotation.z).toBeCloseTo(1.3)
    expect(wheelOf(group).getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(1e-9)
    const after = new THREE.Box3().setFromObject(wheelOf(group)).getSize(new THREE.Vector3())
    expect(after.z).toBeCloseTo(size.z, 6) // it turns in its own plane: no wobble across the bike
  })

  it('has a wide tyre with a tread of alternating blocks, which is what shows a turn from the saddle', () => {
    // From behind the bar the front wheel is seen edge-on, as a strip of tyre: only
    // a tread pattern running round it reads as turning.
    const wheel = wheelOf(buildBikeCockpitModel().group)
    const size = new THREE.Box3().setFromObject(wheel).getSize(new THREE.Vector3())
    expect(size.z).toBeGreaterThan(0.08) // a tyre you can see, not a wire
    const treads: THREE.Mesh[] = []
    wheel.traverse((o) => { if (o.name === 'tread' && o instanceof THREE.Mesh) treads.push(o) })
    expect(treads.length).toBe(2) // two shades, alternating round the rim
    const colours = treads.map((t) => (t.material as THREE.MeshStandardMaterial).color.getHex())
    expect(new Set(colours).size).toBe(2)
  })

  it('has a pattern coarse enough that the wheel never seems to run backward at riding speed', () => {
    // The wagon-wheel effect: a pattern that repeats every P degrees seems to run
    // BACKWARD once the wheel turns more than P/2 between two frames. Riding at
    // 1.6 x walking speed sprinting is about 10 m/s, and a slow machine draws 30
    // frames a second: 10 / 0.349 / 30 = 0.95 rad, 55 degrees a frame. The pattern's
    // period (a light block and a dark one) has to be at least twice that.
    const wheel = wheelOf(buildBikeCockpitModel().group)
    let blocks = 0
    wheel.traverse((o) => {
      if (o.name === 'tread' && o instanceof THREE.Mesh) blocks += o.geometry.getAttribute('position').count > 0 ? 1 : 0
    })
    expect(blocks).toBe(2)
    const period = (2 * Math.PI) / TREAD_BLOCKS * 2
    const perFrameAt30fps = (10 / ROLLING_RADIUS) / 30
    expect(period / 2).toBeGreaterThan(perFrameAt30fps)
  })

  it('has many spokes, so it reads as a wheel and not a few sticks', () => {
    let spokes = 0
    wheelOf(buildBikeCockpitModel().group).traverse((o) => { if (o.name === 'spoke') spokes++ })
    expect(spokes).toBeGreaterThanOrEqual(8)
  })

  it('has one bright reflector on the rim, so a turn is seen: with evenly spaced spokes alone it looks the same every few degrees', () => {
    const { group, spin } = buildBikeCockpitModel()
    const reflector = () => {
      group.updateMatrixWorld(true)
      // the patch on the tread (the group itself sits on the axle and does not move)
      return group.getObjectByName('reflector')!.children[0].getWorldPosition(new THREE.Vector3())
    }
    const at0 = reflector()
    spin(Math.PI / 8) // the spoke spacing: everything else would look identical
    expect(reflector().distanceTo(at0)).toBeGreaterThan(0.05)
    spin(2 * Math.PI)
    expect(reflector().distanceTo(at0)).toBeLessThan(1e-6)
    const mesh = group.getObjectByName('reflector')!.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0.3)
  })

  it('the rim sits where the rolling radius says, so the road speed and the turn agree', () => {
    const { group } = buildBikeCockpitModel()
    group.updateMatrixWorld(true)
    const size = new THREE.Box3().setFromObject(wheelOf(group)).getSize(new THREE.Vector3())
    expect(size.y / 2).toBeCloseTo(ROLLING_RADIUS, 2)
  })
})
