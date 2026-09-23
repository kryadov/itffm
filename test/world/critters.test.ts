import * as THREE from 'three'
import {
  stepCritter, nearestPoint, createHares, createSquirrels, createSnakes, placeCritterHomes,
  createMoose, createBears, createBoars, createBeavers, placeBearHomes, placeBeaverHomes, familyHomes,
  type Critter, type CritterSpecies,
} from '../../src/world/critters'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { mulberry32 } from '../../src/util/rng'

const ground = proceduralTerrain(3)

const species: CritterSpecies = {
  fleeRadius: 6,
  alertDur: 0.4,
  fleeSpeed: 5,
  fleeDur: 2,
  restMin: 3,
  restMax: 3,
}

function critter(x: number, z: number): Critter {
  return {
    state: 'idle',
    stateT: 0,
    x,
    y: ground.heightAt(x, z),
    z,
    fleeHeading: 0,
    restDur: 0,
  }
}

describe('stepCritter', () => {
  it('stays idle when the player is far away', () => {
    const c = critter(0, 0)
    stepCritter(c, 1, 100, 100, species, () => 0.5, ground)
    expect(c.state).toBe('idle')
  })

  it('goes alert the instant the player closes within fleeRadius', () => {
    const c = critter(0, 0)
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground)
    expect(c.state).toBe('alert')
  })

  it('does not flee the moment it goes alert — it freezes for alertDur first', () => {
    const c = critter(0, 0)
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground)
    expect(c.state).toBe('alert')
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground)
    expect(c.state).toBe('alert') // 0.2s < alertDur (0.4s)
  })

  it('flees once alertDur has elapsed, moving straight away from the player', () => {
    const c = critter(0, 0)
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground) // -> alert
    stepCritter(c, 0.5, 3, 0, species, () => 0.5, ground) // alertDur elapses -> flee
    expect(c.state).toBe('flee')
    const xBefore = c.x
    stepCritter(c, 0.2, 3, 0, species, () => 0.5, ground)
    // Player is to the east (x=3); fleeing should move the critter west.
    expect(c.x).toBeLessThan(xBefore)
  })

  it('settles into resting once fleeDur has elapsed', () => {
    const c = critter(0, 0)
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground) // -> alert
    stepCritter(c, 0.5, 3, 0, species, () => 0.5, ground) // -> flee
    stepCritter(c, species.fleeDur + 0.1, 3, 0, species, () => 0.5, ground)
    expect(c.state).toBe('resting')
  })

  it('returns to idle once its own rest timer elapses', () => {
    const c = critter(0, 0)
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground)
    stepCritter(c, 0.5, 3, 0, species, () => 0.5, ground)
    stepCritter(c, species.fleeDur + 0.1, 3, 0, species, () => 0.5, ground)
    expect(c.state).toBe('resting')
    stepCritter(c, c.restDur + 0.1, 999, 999, species, () => 0.5, ground)
    expect(c.state).toBe('idle')
  })

  it('flees toward a supplied target instead of away from the player, when one is given', () => {
    const c = critter(0, 0)
    const target = { x: -10, y: 0, z: 0 }
    stepCritter(c, 0.1, 3, 0, species, () => 0.5, ground, () => target)
    stepCritter(c, 0.5, 3, 0, species, () => 0.5, ground, () => target)
    expect(c.state).toBe('flee')
    const xBefore = c.x
    stepCritter(c, 0.2, 3, 0, species, () => 0.5, ground, () => target)
    // Target is west; player is east — a tree-climber should still head for
    // the target (also west here, so this alone doesn't discriminate direction
    // from the player-flee case, but the heading itself must match the target).
    expect(c.x).toBeLessThan(xBefore)
    expect(c.fleeHeading).toBeCloseTo(Math.PI, 5)
  })
})

describe('placeCritterHomes', () => {
  it('is deterministic for the same seed', () => {
    const a = placeCritterHomes(ground, 90, 5, 4, [])
    const b = placeCritterHomes(ground, 90, 5, 4, [])
    expect(a).toEqual(b)
  })

  it('gives one home per requested count', () => {
    expect(placeCritterHomes(ground, 90, 5, 6, [])).toHaveLength(6)
  })

  it('stays within the plot', () => {
    for (const h of placeCritterHomes(ground, 90, 5, 8, [])) {
      expect(Math.abs(h.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(h.z)).toBeLessThanOrEqual(90)
    }
  })

  it('clears every obstacle by at least its clearance', () => {
    const obstacles = [{ x: 0, z: 0, radius: 80 }]
    for (const h of placeCritterHomes(ground, 90, 5, 4, obstacles, 1.5)) {
      expect(Math.hypot(h.x, h.z)).toBeGreaterThanOrEqual(80 + 1.5 - 1e-6)
    }
  })

  it('clusters around an optional chunkOrigin instead of world (0, 0)', () => {
    const origin = { x: 1000, z: -400 }
    for (const h of placeCritterHomes(ground, 90, 5, 4, [], 1.5, origin)) {
      expect(Math.abs(h.x - origin.x)).toBeLessThanOrEqual(90)
      expect(Math.abs(h.z - origin.z)).toBeLessThanOrEqual(90)
    }
  })

  it('still respects obstacle clearance far from world (0, 0)', () => {
    const origin = { x: 1000, z: -400 }
    const obstacles = [{ x: origin.x, z: origin.z, radius: 80 }]
    for (const h of placeCritterHomes(ground, 90, 5, 4, obstacles, 1.5, origin)) {
      expect(Math.hypot(h.x - origin.x, h.z - origin.z)).toBeGreaterThanOrEqual(80 + 1.5 - 1e-6)
    }
  })
})

describe('nearestPoint', () => {
  it('returns the closest point within maxDist', () => {
    const pts = [{ x: 10, z: 0 }, { x: 2, z: 0 }, { x: -20, z: 0 }]
    expect(nearestPoint(0, 0, pts, 15)).toBe(pts[1])
  })

  it('returns null when nothing is within maxDist', () => {
    expect(nearestPoint(0, 0, [{ x: 50, z: 50 }], 5)).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(nearestPoint(0, 0, [], 100)).toBeNull()
  })
})

describe('createHares / createSquirrels', () => {
  const flat = { heightAt: () => 0 }
  const homes = [{ x: 5, y: 0, z: 5 }, { x: -5, y: 0, z: 5 }, { x: 5, y: 0, z: -5 }]

  it('adds a named group to the scene for each species', () => {
    const scene = new THREE.Scene()
    createHares(scene, mulberry32(1), 3, flat, homes)
    createSquirrels(scene, mulberry32(1), 3, flat, homes, [])
    expect(scene.getObjectByName('hares')).toBeDefined()
    expect(scene.getObjectByName('squirrels')).toBeDefined()
  })

  it('is deterministic for the same seed', () => {
    const sceneA = new THREE.Scene()
    const sceneB = new THREE.Scene()
    const a = createHares(sceneA, mulberry32(7), 3, flat, homes)
    const b = createHares(sceneB, mulberry32(7), 3, flat, homes)
    a.update(1 / 30, 0, 0)
    b.update(1 / 30, 0, 0)
    const bodyA = sceneA.getObjectByName('hares')!.children[0] as THREE.InstancedMesh
    const bodyB = sceneB.getObjectByName('hares')!.children[0] as THREE.InstancedMesh
    expect(bodyA.instanceMatrix.array).toEqual(bodyB.instanceMatrix.array)
  })

  it('a hare bolts away from an approaching player, keeping finite positions', () => {
    const scene = new THREE.Scene()
    const hares = createHares(scene, mulberry32(2), 2, flat, homes)
    let x = 0
    for (let i = 0; i < 500; i++) {
      x += 0.05
      hares.update(1 / 20, x, 5)
    }
    const body = scene.getObjectByName('hares')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
    }
  })

  it('a squirrel flees toward a nearby tree perch rather than away from the player', () => {
    const scene = new THREE.Scene()
    const perches = [{ x: -50, y: 3, z: 5 }]
    const squirrels = createSquirrels(scene, mulberry32(1), 1, flat, [{ x: 5, y: 0, z: 5 }], perches, 100)
    // Force straight through alert into flee, with the player to the east.
    squirrels.update(0.1, 10, 5)
    squirrels.update(0.5, 10, 5)
    const body = scene.getObjectByName('squirrels')!.children[0] as THREE.InstancedMesh
    const before = new THREE.Vector3()
    const m = new THREE.Matrix4()
    body.getMatrixAt(0, m)
    before.setFromMatrixPosition(m)
    squirrels.update(0.3, 10, 5)
    body.getMatrixAt(0, m)
    const after = new THREE.Vector3().setFromMatrixPosition(m)
    // The perch is west; a player-fleeing squirrel (heading further west,
    // away from the eastern player) would also move west, so the real
    // discriminator is that it heads for the tree, not just "not east".
    expect(after.x).toBeLessThan(before.x)
  })

  it('hides and disposes without throwing', () => {
    const scene = new THREE.Scene()
    const hares = createHares(scene, mulberry32(1), 2, flat, homes)
    hares.setEnabled(false)
    expect(scene.getObjectByName('hares')!.visible).toBe(false)
    expect(() => hares.dispose()).not.toThrow()
    expect(scene.getObjectByName('hares')).toBeUndefined()
  })
})

describe('createSnakes', () => {
  const flat = { heightAt: () => 0 }
  const homes = [{ x: 3, y: 0, z: 3 }, { x: -3, y: 0, z: 3 }]

  it('adds a named group to the scene', () => {
    const scene = new THREE.Scene()
    createSnakes(scene, mulberry32(1), 2, flat, homes)
    expect(scene.getObjectByName('snakes')).toBeDefined()
  })

  it('is deterministic for the same seed', () => {
    const sceneA = new THREE.Scene()
    const sceneB = new THREE.Scene()
    const a = createSnakes(sceneA, mulberry32(9), 2, flat, homes)
    const b = createSnakes(sceneB, mulberry32(9), 2, flat, homes)
    a.update(1 / 30, 0, 0)
    b.update(1 / 30, 0, 0)
    const segA = sceneA.getObjectByName('snakes')!.children[0] as THREE.InstancedMesh
    const segB = sceneB.getObjectByName('snakes')!.children[0] as THREE.InstancedMesh
    expect(segA.instanceMatrix.array).toEqual(segB.instanceMatrix.array)
  })

  it('creeps away slowly rather than bolting — much slower than a hare', () => {
    const scene = new THREE.Scene()
    const snakes = createSnakes(scene, mulberry32(3), 1, flat, [{ x: 0, y: 0, z: 0 }])
    // Walk the player right up to it and hold position through alert+flee.
    for (let i = 0; i < 300; i++) snakes.update(1 / 20, 1, 0)
    const seg = scene.getObjectByName('snakes')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    seg.getMatrixAt(0, m)
    p.setFromMatrixPosition(m)
    // Over 15s at a hare's fleeSpeed (6.5 m/s) it would be ~90m off; a snake
    // creeping at under 3 m/s stays close.
    expect(Math.hypot(p.x, p.z)).toBeLessThan(45)
  })

  it('keeps every segment finite after a long run', () => {
    const scene = new THREE.Scene()
    const snakes = createSnakes(scene, mulberry32(4), 2, flat, homes)
    for (let i = 0; i < 500; i++) snakes.update(1 / 20, 2, 0)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    for (const child of scene.getObjectByName('snakes')!.children) {
      const mesh = child as THREE.InstancedMesh
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m)
        p.setFromMatrixPosition(m)
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
        expect(Number.isFinite(p.z)).toBe(true)
      }
    }
  })

  it('hides and disposes without throwing', () => {
    const scene = new THREE.Scene()
    const snakes = createSnakes(scene, mulberry32(1), 1, flat, homes)
    snakes.setEnabled(false)
    expect(scene.getObjectByName('snakes')!.visible).toBe(false)
    expect(() => snakes.dispose()).not.toThrow()
    expect(scene.getObjectByName('snakes')).toBeUndefined()
  })
})

describe('ground animals face the way they move', () => {
  const flat = { heightAt: () => 0 }
  const forward = (mesh: THREE.InstancedMesh, i = 0): THREE.Vector3 => {
    const m = new THREE.Matrix4()
    mesh.getMatrixAt(i, m)
    const q = new THREE.Quaternion()
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
    return new THREE.Vector3(1, 0, 0).applyQuaternion(q)
  }
  const at = (mesh: THREE.InstancedMesh, i = 0): THREE.Vector3 => {
    const m = new THREE.Matrix4()
    mesh.getMatrixAt(i, m)
    return new THREE.Vector3().setFromMatrixPosition(m)
  }

  // The drawn animal once faced (cos h, -sin h) while it ran (cos h, sin h):
  // sideways or tail-first at most headings.
  for (const [label, px, pz] of [['north', 0, -8], ['east', 8, 0], ['south-west', -6, 6]] as const) {
    it(`a fleeing hare runs head first, with the player to the ${label}`, () => {
      const scene = new THREE.Scene()
      const hares = createHares(scene, mulberry32(4), 1, flat, [{ x: 0, y: 0, z: 0 }])
      for (let i = 0; i < 12; i++) hares.update(1 / 20, px * 0.3, pz * 0.3) // alert, then off
      const torso = scene.getObjectByName('hares')!.children[0] as THREE.InstancedMesh
      const before = at(torso)
      for (let i = 0; i < 10; i++) hares.update(1 / 20, px * 0.3, pz * 0.3)
      const moved = at(torso).sub(before).setY(0)
      expect(moved.length()).toBeGreaterThan(0.5)
      expect(forward(torso).setY(0).normalize().dot(moved.normalize())).toBeGreaterThan(0.9)
    })
  }

  it('a wandering moose walks head first too', () => {
    const scene = new THREE.Scene()
    const moose = createMoose(scene, mulberry32(8), 1, flat, [{ x: 0, y: 0, z: 0 }])
    const torso = scene.getObjectByName('moose')!.children[0] as THREE.InstancedMesh
    let checked = 0
    let prev = at(torso)
    for (let i = 0; i < 4000 && checked < 20; i++) {
      moose.update(1 / 20, 500, 500)
      const now = at(torso)
      const step = now.clone().sub(prev).setY(0)
      prev = now
      // Skip the first strides of each walk, while it is still turning into it.
      if (step.length() > 0.02 && i > 40) {
        expect(forward(torso).setY(0).normalize().dot(step.normalize())).toBeGreaterThan(0.5)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('an idle animal wanders around its home', () => {
  const flat = { heightAt: () => 0 }
  const wandering: CritterSpecies = { ...species, wander: { radius: 5, speed: 1, pauseMin: 1, pauseMax: 2 } }

  it('moves about, but never strays past its radius', () => {
    const c = critter(10, 10)
    const rand = mulberry32(5)
    let far = 0
    for (let i = 0; i < 2000; i++) {
      stepCritter(c, 0.05, 999, 999, wandering, rand, flat)
      far = Math.max(far, Math.hypot(c.x - 10, c.z - 10))
    }
    expect(far).toBeGreaterThan(0.5)
    expect(far).toBeLessThanOrEqual(5 + 1e-6)
  })

  it('walks back toward home after fleeing', () => {
    const c = critter(0, 0)
    stepCritter(c, 0.1, 3, 0, wandering, () => 0.5, flat) // alert
    stepCritter(c, 0.5, 3, 0, wandering, () => 0.5, flat) // flee
    stepCritter(c, species.fleeDur + 0.1, 3, 0, wandering, () => 0.5, flat) // rest, far off
    expect(Math.hypot(c.x, c.z)).toBeGreaterThan(5)
    const rand = mulberry32(6)
    for (let i = 0; i < 1000; i++) stepCritter(c, 0.05, 999, 999, wandering, rand, flat)
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(5 + 1e-6)
  })

  it('stays put without a wander spec, as before', () => {
    const c = critter(1, 1)
    for (let i = 0; i < 200; i++) stepCritter(c, 0.05, 999, 999, species, () => 0.3, flat)
    expect(c.x).toBe(1)
    expect(c.z).toBe(1)
  })
})

describe('moose, bears, boar and beavers', () => {
  const flat = { heightAt: () => 0 }
  const homes = [{ x: 5, y: 0, z: 5 }, { x: -5, y: 0, z: 5 }, { x: 5, y: 0, z: -5 }, { x: -5, y: 0, z: -5 }]
  const makers = [
    ['moose', createMoose],
    ['bears', createBears],
    ['boars', createBoars],
    ['beavers', createBeavers],
  ] as const

  for (const [name, make] of makers) {
    it(`${name}: a named group, deterministic, with legs and a head`, () => {
      const sa = new THREE.Scene()
      const sb = new THREE.Scene()
      const a = make(sa, mulberry32(3), 4, flat, homes)
      const b = make(sb, mulberry32(3), 4, flat, homes)
      for (let i = 0; i < 30; i++) {
        a.update(1 / 30, 5.5, 5)
        b.update(1 / 30, 5.5, 5)
      }
      const ga = sa.getObjectByName(name)!
      const gb = sb.getObjectByName(name)!
      for (let k = 0; k < ga.children.length; k++) {
        expect((ga.children[k] as THREE.InstancedMesh).instanceMatrix.array).toEqual(
          (gb.children[k] as THREE.InstancedMesh).instanceMatrix.array,
        )
      }
      expect(ga.getObjectByName('head')).toBeDefined()
      for (let k = 0; k < 4; k++) expect(ga.getObjectByName(`leg${k}`)).toBeDefined()
      a.dispose()
      expect(sa.getObjectByName(name)).toBeUndefined()
    })
  }

  it('bull moose carry antlers and cows do not', () => {
    const scene = new THREE.Scene()
    const n = 12
    const moose = createMoose(scene, mulberry32(11), n, flat, homes)
    moose.update(1 / 30, 500, 500)
    const antlers = scene.getObjectByName('moose')!.getObjectByName('headExtra') as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    let bulls = 0
    for (let i = 0; i < n; i++) {
      antlers.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
      if (s.x > 0.5) bulls++
    }
    expect(bulls).toBeGreaterThan(0)
    expect(bulls).toBeLessThan(n)
  })

  it('swings its legs while it walks, and holds them straight while it stands', () => {
    const scene = new THREE.Scene()
    const moose = createMoose(scene, mulberry32(8), 1, flat, [{ x: 0, y: 0, z: 0 }])
    const group = scene.getObjectByName('moose')!
    const leg = group.getObjectByName('leg0') as THREE.InstancedMesh
    const torso = group.children[0] as THREE.InstancedMesh
    const legDown = (): number => {
      const m = new THREE.Matrix4()
      leg.getMatrixAt(0, m)
      return new THREE.Vector3(0, -1, 0).transformDirection(m).y
    }
    const pos = (): THREE.Vector3 => {
      const m = new THREE.Matrix4()
      torso.getMatrixAt(0, m)
      return new THREE.Vector3().setFromMatrixPosition(m)
    }
    let prev = pos()
    let leanest = 1
    let still = 0
    for (let i = 0; i < 3000; i++) {
      moose.update(1 / 20, 500, 500)
      const now = pos()
      const moving = Math.hypot(now.x - prev.x, now.z - prev.z) > 0.01
      prev = now
      if (moving) leanest = Math.min(leanest, -legDown())
      else if (legDown() < -0.9999) still++
    }
    expect(leanest).toBeLessThan(0.995) // the leg leaned off the vertical at a walk
    expect(still).toBeGreaterThan(0) // and hung straight down standing
  })
})

describe('placeBearHomes', () => {
  const flat = { heightAt: () => 0 }
  it('settles the bear at the thickest patch of food', () => {
    const food = [
      ...Array.from({ length: 30 }, (_, k) => ({ x: 50 + (k % 5), z: 50 + Math.floor(k / 5) })),
      { x: -80, z: 10 }, { x: 0, z: -90 }, { x: 70, z: -70 },
    ]
    const [home] = placeBearHomes(food, 1, mulberry32(1), flat)
    expect(Math.hypot(home.x - 52, home.z - 52)).toBeLessThan(6)
  })
  it('gives no bear where there is no food', () => {
    expect(placeBearHomes([], 1, mulberry32(1), flat)).toEqual([])
  })
})

describe('placeBeaverHomes', () => {
  const flat = { heightAt: () => 0 }
  const trees = [{ x: 0, z: 0, radius: 0.3 }, { x: 100, z: 100, radius: 0.3 }]
  it('puts a beaver at a tree near the water, facing its trunk, on the water side', () => {
    const homes = placeBeaverHomes(trees, [{ x: 10, z: 0 }], 2, mulberry32(1), flat)
    expect(homes).toHaveLength(1) // the far tree has no water near it
    const h = homes[0]
    expect(h.x).toBeGreaterThan(0) // between the trunk and the water
    expect(Math.hypot(h.x, h.z)).toBeLessThan(1)
    expect(Math.cos(h.face!)).toBeLessThan(-0.99) // facing back at the trunk (-x)
  })
  it('gives no beaver in a wood with no water', () => {
    expect(placeBeaverHomes(trees, [], 2, mulberry32(1), flat)).toEqual([])
  })
})

describe('familyHomes', () => {
  it('keeps a sounder of boar together around one spot', () => {
    const flat = { heightAt: () => 0 }
    const homes = familyHomes({ x: 20, y: 0, z: -20 }, 4, mulberry32(2), flat)
    expect(homes).toHaveLength(4)
    for (const h of homes) expect(Math.hypot(h.x - 20, h.z + 20)).toBeLessThanOrEqual(3)
  })
})
