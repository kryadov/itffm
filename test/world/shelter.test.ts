import * as THREE from 'three'
import {
  placeShelter,
  shelterObstacle,
  buildShelterMesh,
  wallObstacles,
  interiorObstacles,
  doorObstacle,
  doorPosition,
  DOOR_INTERACT_RADIUS,
  FOUNDATION_DEPTH,
  DEPTH,
  DOOR_WIDTH,
  nearestBikeSpot,
  bikeSpotLocal,
  DEFAULT_BIKE_SPOT,
  rodSpotWorld,
  bikeSpotWorld,
  insideHut,
  onHutFootprint,
  hutFloorY,
  FLOOR_TOP,
  type ShelterWall,
} from '../../src/world/shelter'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { stepPlayer, type PlayerState } from '../../src/game/player'
import type { Circle } from '../../src/util/openSpot'

const ground = proceduralTerrain(5)

describe('placeShelter', () => {
  it('is deterministic', () => {
    expect(placeShelter(ground, 90, 3, [])).toEqual(placeShelter(ground, 90, 3, []))
  })

  it('gives a different spot for a different seed', () => {
    expect(placeShelter(ground, 90, 1, []).x).not.toBe(placeShelter(ground, 90, 2, []).x)
  })

  // A live report (2026-09-24): on a slope the ground and its grass came up
  // through the floor, because the hut stood on one sample at its centre.
  it('stands on the highest ground under its footprint, so none shows through the floor', () => {
    const slope = { heightAt: (x: number, z: number) => 0.2 * x + 0.1 * z }
    const s = placeShelter(slope, 90, 3, [])
    expect(s.y).toBeGreaterThan(slope.heightAt(s.x, s.z) + 0.1)
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const x = s.x - 2 + (4 * i) / 20
        const z = s.z - 2 + (4 * j) / 20
        if (insideHut(s, x, z)) expect(hutFloorY(s)).toBeGreaterThanOrEqual(slope.heightAt(x, z))
      }
    }
    const flat = placeShelter(ground, 90, 3, [])
    expect(flat.y).toBeGreaterThanOrEqual(ground.heightAt(flat.x, flat.z))
    expect(flat.y).toBeLessThan(ground.heightAt(flat.x, flat.z) + 0.5)
  })

  it('stays clear of existing obstacles by more than a player would need', () => {
    const obstacles: Circle[] = [{ x: 0, z: 0, radius: 0.3 }]
    const s = placeShelter(ground, 90, 3, obstacles)
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(2)
  })

  it('stays within the plot', () => {
    const s = placeShelter(ground, 5, 3, [])
    expect(Math.abs(s.x)).toBeLessThanOrEqual(5)
    expect(Math.abs(s.z)).toBeLessThanOrEqual(5)
  })

  it('stands where a surveyor actually mapped one, not wherever the search would land it', () => {
    const s = placeShelter(ground, 90, 3, [], [{ x: 12, z: -7 }])
    expect(s.x).toBe(12)
    expect(s.z).toBe(-7)
    expect(s.y).toBeGreaterThanOrEqual(ground.heightAt(12, -7))
  })

  it('ignores a mapped hut that falls outside this plot', () => {
    const withoutMapped = placeShelter(ground, 90, 3, [])
    const withOffPlot = placeShelter(ground, 90, 3, [], [{ x: 500, z: 500 }])
    expect(withOffPlot).toEqual(withoutMapped)
  })

  it('falls back to the procedural search with no mapped hut at all', () => {
    expect(placeShelter(ground, 90, 3, [], [])).toEqual(placeShelter(ground, 90, 3, []))
  })
})

describe('shelterObstacle', () => {
  // The whole-footprint circle used only to site something else (the
  // campfire) clear of the hut — NOT what the player collides with any
  // more, or the doorway (below) would be blocked along with the walls.
  it('covers the whole footprint, corner included', () => {
    const s = { x: 4, z: -2, y: 0, rotationY: 0.5 }
    const o = shelterObstacle(s)
    expect(o.x).toBe(4)
    expect(o.z).toBe(-2)
    expect(o.radius).toBeGreaterThan(1)
  })
})

describe('buildShelterMesh', () => {
  const s = { x: 4, z: -2, y: 0, rotationY: 0.5 }

  describe('the parked bicycle', () => {
    // A live report (2026-09-19): on a hillside the bike stood half in the
    // ground beside the door, its wheel touching the doorway's edge.
    const wheelsOf = (bike: THREE.Object3D) => {
      const wheels: THREE.Object3D[] = []
      bike.traverse((o) => {
        if (o.name === 'wheel') wheels.push(o)
      })
      return wheels
    }
    const WALLS: ShelterWall[] = ['front', 'back', 'left', 'right']

    it.each([
      ['flat', () => 0],
      ['a slope along the wall', (x: number, z: number) => 0.25 * x - 0.1 * z],
      ['a steep slope', (x: number, z: number) => -0.4 * x + 0.3 * z],
    ])('stands on the real ground under both wheels on %s, at every wall', (_label, h) => {
      const ground = { heightAt: h }
      const shelter = { x: 4, z: -2, y: h(4, -2), rotationY: 0.5 }
      for (const wall of WALLS) {
        const { group, setBikePlaced } = buildShelterMesh(shelter, ground)
        setBikePlaced(true, { wall, along: 0 })
        group.updateMatrixWorld(true)
        const wheels = wheelsOf(group.getObjectByName('bike')!)
        expect(wheels).toHaveLength(2)
        for (const wheel of wheels) {
          const at = wheel.getWorldPosition(new THREE.Vector3())
          const bottom = new THREE.Box3().setFromObject(wheel).min.y
          // Neither sunk into the terrain nor floating above it.
          expect(bottom).toBeGreaterThan(ground.heightAt(at.x, at.z) - 0.1)
          expect(bottom).toBeLessThan(ground.heightAt(at.x, at.z) + 0.15)
        }
      }
    })

    it('is hidden until placed, and shown once it is', () => {
      const { group, setBikePlaced } = buildShelterMesh(s)
      const bike = group.getObjectByName('bike')!
      expect(bike.visible).toBe(false)
      setBikePlaced(true)
      expect(bike.visible).toBe(true)
      setBikePlaced(false)
      expect(bike.visible).toBe(false)
    })

    it.each(WALLS)('stands clear of the hut, along the %s wall, never inside it', (wall) => {
      const { group, setBikePlaced } = buildShelterMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
      for (const along of [-5, -1, 0, 1, 5]) {
        setBikePlaced(true, { wall, along })
        group.updateMatrixWorld(true)
        const bike = new THREE.Box3().setFromObject(group.getObjectByName('bike')!)
        // Outside the walls' own footprint (3.6 x 3.1), with a hair of slack for the lean.
        const insideX = bike.max.x > -1.7 && bike.min.x < 1.7
        const insideZ = bike.max.z > -1.45 && bike.min.z < 1.45
        expect(insideX && insideZ).toBe(false)
      }
    })

    it('stops short of the doorway when left by the door, on either side', () => {
      const { group, setBikePlaced } = buildShelterMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
      for (const along of [-0.3, 0, 0.3, 1.2, -1.2]) {
        setBikePlaced(true, { wall: 'front', along })
        group.updateMatrixWorld(true)
        const bike = new THREE.Box3().setFromObject(group.getObjectByName('bike')!)
        // Nothing of it within the doorway's width, plus a hand's breadth.
        expect(bike.max.x < -(DOOR_WIDTH / 2 + 0.1) || bike.min.x > DOOR_WIDTH / 2 + 0.1).toBe(true)
      }
    })

    it('lies along whichever wall it is left against', () => {
      const { group, setBikePlaced } = buildShelterMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
      const size = (wall: ShelterWall) => {
        setBikePlaced(true, { wall, along: 0 })
        group.updateMatrixWorld(true)
        return new THREE.Box3().setFromObject(group.getObjectByName('bike')!).getSize(new THREE.Vector3())
      }
      // Front/back walls run along x; left/right walls along z.
      for (const wall of ['front', 'back'] as const) expect(size(wall).x).toBeGreaterThan(size(wall).z)
      for (const wall of ['left', 'right'] as const) expect(size(wall).z).toBeGreaterThan(size(wall).x)
    })
  })

  describe('nearestBikeSpot', () => {
    const hut = { x: 10, z: -4, y: 0, rotationY: 0.9 }
    // A point a given distance out from a wall's middle, in the hut's own frame.
    const outside = (lx: number, lz: number) => {
      const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), hut.rotationY)
      return { x: hut.x + v.x, z: hut.z + v.z }
    }

    it.each([
      ['front', 0.4, -3.0],
      ['back', -0.4, 3.0],
      ['left', -3.1, 0.2],
      ['right', 3.1, -0.2],
    ] as const)('picks the %s wall for someone standing out from it', (wall, lx, lz) => {
      expect(nearestBikeSpot(hut, outside(lx, lz)).spot.wall).toBe(wall)
    })

    it('reports how far the player is from the hut, in metres', () => {
      const p = outside(0.3, -1.55 - 1.2) // 1.2 m off the front wall
      const { point } = nearestBikeSpot(hut, p)
      expect(Math.hypot(p.x - point.x, p.z - point.z)).toBeCloseTo(1.2, 5)
    })

    it('leaves the bike where the player stood along the wall', () => {
      const a = nearestBikeSpot(hut, outside(3.0, 0.5)).spot // right wall
      const b = nearestBikeSpot(hut, outside(3.0, -0.5)).spot
      expect(a.wall).toBe('right')
      expect(b.wall).toBe('right')
      expect(a.along).toBeGreaterThan(b.along)
    })

    it('still picks a wall for someone standing inside the hut', () => {
      const { spot, point } = nearestBikeSpot(hut, outside(0, 1.0))
      expect(['front', 'back', 'left', 'right']).toContain(spot.wall)
      expect(Number.isFinite(point.x) && Number.isFinite(point.z)).toBe(true)
    })
  })

  describe('bikeSpotLocal', () => {
    it('is deterministic and finite for every wall', () => {
      for (const wall of ['front', 'back', 'left', 'right'] as const) {
        const a = bikeSpotLocal({ wall, along: 0.4 })
        expect(bikeSpotLocal({ wall, along: 0.4 })).toEqual(a)
        expect(Number.isFinite(a.x + a.z + a.yaw)).toBe(true)
      }
    })
  })

  it('places the group at the shelter position', () => {
    const { group } = buildShelterMesh(s)
    expect(group.position.x).toBe(4)
    expect(group.position.z).toBe(-2)
  })

  it('lets some light through its glass instead of reading as a solid patch', () => {
    // Live report: windows looked small and opaque — the glass material
    // never set transparent/opacity at all (a MeshStandardMaterial defaults
    // fully opaque), so it read as a flat-coloured square, not glass.
    const { group } = buildShelterMesh(s)
    const glass = group.getObjectByName('glass') as THREE.Mesh
    const mat = glass.material as THREE.MeshStandardMaterial
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBeLessThan(1)
    expect(mat.opacity).toBeGreaterThan(0)
  })

  it('stays dark by day and glows at full night', () => {
    const { group, setNight } = buildShelterMesh(s)
    const glass = group.getObjectByName('glass') as THREE.Mesh
    const mat = glass.material as THREE.MeshStandardMaterial
    setNight(0)
    expect(mat.emissiveIntensity).toBe(0)
    setNight(1)
    expect(mat.emissiveIntensity).toBeGreaterThan(0)
  })

  it('lets the smoke drift without throwing', () => {
    const { update } = buildShelterMesh(s)
    expect(() => {
      for (let i = 0; i < 30; i++) update(1 / 30)
    }).not.toThrow()
  })

  it('shadows its own lamp light off its own walls, so night light does not leak through the floor', () => {
    const { group } = buildShelterMesh(s)
    const walls = group.getObjectByName('walls') as THREE.Group
    expect(walls.children.length).toBeGreaterThan(0)
    for (const panel of walls.children as THREE.Mesh[]) {
      expect(panel.castShadow).toBe(true)
      expect(panel.receiveShadow).toBe(true)
    }
    let light: THREE.PointLight | undefined
    group.traverse((c) => {
      if (c instanceof THREE.PointLight) light = c
    })
    expect(light?.castShadow).toBe(true)
  })

  it('gives each window a muntin bar, not just a bare pane', () => {
    const { group } = buildShelterMesh(s)
    const window = group.children.find((c) => c.getObjectByName('glass')) as THREE.Group
    // frame + two glass panes + two muntin bars = five parts.
    expect(window.children.length).toBe(5)
  })

  it('adds a firewood pile and a well next to the hut', () => {
    const { group } = buildShelterMesh(s)
    const firewood = group.getObjectByName('firewood')!
    const well = group.getObjectByName('well')!
    expect(firewood.children.length).toBeGreaterThan(0)
    expect(well.children.length).toBeGreaterThan(0)
    // Both stand outside the hut's own footprint, not inside its walls.
    expect(Math.hypot(firewood.position.x, firewood.position.z)).toBeGreaterThan(1)
    expect(Math.hypot(well.position.x, well.position.z)).toBeGreaterThan(1)
  })

  it('keeps every log of the firewood pile clear of the wall it leans against', () => {
    // The pile's own origin sits outside the wall (the test above), but each
    // log's own body extends further out from that origin — a live report
    // (2026-09-09) found logs visually poking through the wall despite the
    // origin check passing, because the row-spacing axis and each log's own
    // length axis were the same axis: a log 0.5m long, offset only ~0.2m from
    // its neighbour, reaches back well past where the pile's own anchor point
    // already cleared the wall.
    const { group } = buildShelterMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
    const walls = group.getObjectByName('walls') as THREE.Group
    walls.updateMatrixWorld(true)
    const wallBox = new THREE.Box3().setFromObject(walls)

    const firewood = group.getObjectByName('firewood')!
    firewood.updateMatrixWorld(true)
    for (const log of firewood.children) {
      const logBox = new THREE.Box3().setFromObject(log)
      expect(logBox.intersectsBox(wallBox)).toBe(false)
    }
  })
})

describe('wallObstacles', () => {
  const s = { x: 0, z: 0, y: 0, rotationY: 0 }

  it('leaves the doorway gap open — no wall circle sits in front of it', () => {
    // The door faces local -Z; with rotationY 0 that is world -Z too.
    for (const c of wallObstacles(s)) {
      if (c.z > -1.4 && c.z < -1.2) expect(Math.abs(c.x)).toBeGreaterThan(0.4)
    }
  })

  it('rotates with the shelter, not just the mesh', () => {
    const rotated = { ...s, rotationY: Math.PI / 2 }
    const straight = wallObstacles(s)
    const turned = wallObstacles(rotated)
    // Same number of circles, same distances from the hut's own centre —
    // only which world axis they line up with changes.
    expect(turned).toHaveLength(straight.length)
    const dist = (c: Circle) => Math.hypot(c.x, c.z)
    const sortedStraight = straight.map(dist).sort((a, b) => a - b)
    const sortedTurned = turned.map(dist).sort((a, b) => a - b)
    for (let i = 0; i < sortedStraight.length; i++) {
      expect(sortedTurned[i]).toBeCloseTo(sortedStraight[i], 5)
    }
  })
})

describe('doorObstacle / doorPosition', () => {
  const s = { x: 0, z: 0, y: 0, rotationY: 0 }

  it('sits exactly at the doorway', () => {
    expect(doorObstacle(s).x).toBeCloseTo(doorPosition(s).x, 5)
    expect(doorObstacle(s).z).toBeCloseTo(doorPosition(s).z, 5)
  })

  it('is wide enough to block the whole doorway gap', () => {
    expect(doorObstacle(s).radius).toBeGreaterThan(0.95 / 2)
  })

  it('is within interacting distance of the hut it belongs to', () => {
    const p = doorPosition(s)
    expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThan(DOOR_INTERACT_RADIUS)
  })
})

describe('buildShelterMesh — door state', () => {
  const s = { x: 0, z: 0, y: 0, rotationY: 0 }

  it('starts closed', () => {
    const { isDoorOpen, doorObstacle: obstacle } = buildShelterMesh(s)
    expect(isDoorOpen()).toBe(false)
    expect(obstacle.radius).toBeGreaterThan(0)
  })

  it('opens and closes on toggleDoor(), clearing/restoring the shared obstacle', () => {
    const { isDoorOpen, toggleDoor, doorObstacle: obstacle } = buildShelterMesh(s)
    toggleDoor()
    expect(isDoorOpen()).toBe(true)
    expect(obstacle.radius).toBe(0)
    toggleDoor()
    expect(isDoorOpen()).toBe(false)
    expect(obstacle.radius).toBeGreaterThan(0)
  })

  it('extends the ground-touching walls and floor into a foundation, so uneven terrain leaves no gap underneath', () => {
    // Live report: on a bumpy site a wall's rigid, flat bottom edge could sit
    // above the real ground under one corner, leaving a literal hole the
    // lamp's light leaked through. Every wall that actually reaches the
    // ground (not the lintel, which never does) and the floor should now
    // reach at least FOUNDATION_DEPTH below the hut's own origin.
    const { group } = buildShelterMesh(s)
    const walls = group.getObjectByName('walls') as THREE.Group
    for (const panel of walls.children as THREE.Mesh[]) {
      const box = new THREE.Box3().setFromObject(panel)
      const touchesGround = box.min.y < 0.01
      if (!touchesGround) continue // the lintel, floating over the doorway
      expect(box.min.y).toBeLessThanOrEqual(-FOUNDATION_DEPTH + 0.01)
    }
    const floor = group.children.find(
      (c) => c instanceof THREE.Mesh && Math.abs(c.position.x) < 1e-6 && c.position.y < 0,
    ) as THREE.Mesh
    expect(floor).toBeTruthy()
    expect(new THREE.Box3().setFromObject(floor).min.y).toBeLessThanOrEqual(-FOUNDATION_DEPTH + 0.01)
  })

  it('lays a floor of separate boards in more than one shade, its top at FLOOR_TOP', () => {
    const { group } = buildShelterMesh(s)
    const boards = group.getObjectByName('floorBoards') as THREE.Mesh
    expect(boards).toBeTruthy()
    const box = new THREE.Box3().setFromObject(boards)
    expect(box.max.y).toBeCloseTo(FLOOR_TOP, 3)
    const colors = boards.geometry.getAttribute('color')
    const shades = new Set<string>()
    for (let i = 0; i < colors.count; i++) shades.add(colors.getX(i).toFixed(3))
    expect(shades.size).toBeGreaterThan(4)
  })

  it('puts a rug on the floor, on top of the boards', () => {
    const { group } = buildShelterMesh(s)
    const rug = group.getObjectByName('rug')!
    expect(rug).toBeTruthy()
    const box = new THREE.Box3().setFromObject(rug)
    expect(box.min.y).toBeGreaterThanOrEqual(FLOOR_TOP - 1e-6)
    expect(box.max.y).toBeLessThan(FLOOR_TOP + 0.02)
  })

  it('shows a handle and plank grooves on both faces, not just the inside', () => {
    // Live report: the original relief (grooves + handle) sat only at
    // positive-z offsets — the hut-interior face of the door slab — so the
    // door read as blank from outside. Both signs should now appear.
    const { group } = buildShelterMesh(s)
    const hinge = group.getObjectByName('doorHinge')!
    const zs = hinge.children.map((c) => c.position.z).filter((z) => z !== 0)
    expect(zs.some((z) => z > 0)).toBe(true)
    expect(zs.some((z) => z < 0)).toBe(true)
  })

  it('swings the visible door leaf toward open over time, not instantly', () => {
    const { group, toggleDoor, update } = buildShelterMesh(s)
    const hinge = group.getObjectByName('doorHinge')!
    toggleDoor()
    expect(hinge.rotation.y).toBe(0)
    for (let i = 0; i < 30; i++) update(1 / 30)
    expect(hinge.rotation.y).not.toBe(0)
  })
})

describe('walking through the doorway (integration)', () => {
  it('is blocked by the closed door, then can walk through once it opens', () => {
    const s = { x: 0, z: 0, y: 0, rotationY: 0 }
    const { toggleDoor, doorObstacle: obstacle } = buildShelterMesh(s)
    const obstacles: Circle[] = [...wallObstacles(s), obstacle]

    const neutralInput = {
      forward: 1, strafe: 0, dYaw: 0, dPitch: 0, crouching: false, sprinting: false, jumping: false, dt: 1 / 30,
    }
    // yaw Math.PI walks toward +Z in game/player.ts's own convention (rawZ =
    // -cos(yaw)*forward) — the doorway sits at z=-1.3, the hut interior at
    // z>-1.3, so this walks from outside straight at the door.
    let player: PlayerState = {
      x: 0, z: -3, yaw: Math.PI, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0, bobPhase: 0,
    }
    for (let i = 0; i < 200; i++) player = stepPlayer(player, neutralInput, ground, obstacles)
    // Door closed: actually walked up to the doorway's own blocker (not just
    // sitting wherever it started) but never through it, into the hut. The
    // doorway itself sits at local z = -DEPTH/2 (2026-09-11 growth step put
    // DEPTH at 3.1, so z = -1.55) — bounds below follow from that, not the
    // hut's old size.
    expect(player.z).toBeGreaterThan(-2.8)
    expect(player.z).toBeLessThan(-1.55)

    toggleDoor()
    let opened: PlayerState = {
      x: 0, z: -3, yaw: Math.PI, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0, bobPhase: 0,
    }
    for (let i = 0; i < 200; i++) opened = stepPlayer(opened, neutralInput, ground, obstacles)
    // Door open: the same walk now actually enters the hut.
    expect(opened.z).toBeGreaterThan(-1.55)
  })
})

describe('interiorObstacles', () => {
  it('gives the bed and the table their own collision, apart from the walls', () => {
    const s = { x: 0, z: 0, y: 0, rotationY: 0 }
    const obstacles = interiorObstacles(s)
    expect(obstacles).toHaveLength(2)
    for (const o of obstacles) expect(o.radius).toBeGreaterThan(0)
  })

  it('rotates with the shelter', () => {
    const straight = interiorObstacles({ x: 0, z: 0, y: 0, rotationY: 0 })
    const turned = interiorObstacles({ x: 0, z: 0, y: 0, rotationY: Math.PI / 2 })
    const dist = (c: Circle) => Math.hypot(c.x, c.z)
    const sortedStraight = straight.map(dist).sort((a, b) => a - b)
    const sortedTurned = turned.map(dist).sort((a, b) => a - b)
    for (let i = 0; i < sortedStraight.length; i++) expect(sortedTurned[i]).toBeCloseTo(sortedStraight[i], 5)
  })
})

describe('buildShelterMesh — furniture', () => {
  const s = { x: 0, z: 0, y: 0, rotationY: 0 }

  it('adds a bed, a table, a cup on the table, and a painting', () => {
    const { group } = buildShelterMesh(s)
    const bed = group.getObjectByName('bed')
    const table = group.getObjectByName('table')
    const cup = group.getObjectByName('cup')
    const painting = group.getObjectByName('painting')
    expect(bed?.children.length).toBeGreaterThan(0)
    expect(table?.children.length).toBeGreaterThan(0)
    expect(painting?.children.length).toBeGreaterThan(0)
    // The cup lives on the table, not loose in the room.
    expect(cup?.parent).toBe(table)
  })

  it('sits the cup on the table\'s own surface, not floating or sunk into it', () => {
    const { group } = buildShelterMesh(s)
    const table = group.getObjectByName('table')!
    const cup = group.getObjectByName('cup')!
    // The table surface sits at y=0.45 (tableHeight) in buildShelterMesh's
    // own local frame; the cup should rest at or just above it, not below.
    expect(cup.position.y + table.position.y).toBeGreaterThan(0.45)
  })

  it('paints the little back-wall scene in more than one colour, not a single flat card', () => {
    const { group } = buildShelterMesh(s)
    const painting = group.getObjectByName('painting')!
    const colors = new Set(
      painting.children
        .filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
        .map((c) => (c.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).color.getHex()),
    )
    expect(colors.size).toBeGreaterThan(2)
  })
})

describe('buildShelterMesh — quest trophies', () => {
  const s = { x: 0, z: 0, y: 0, rotationY: 0 }

  it('builds the drone box, rod and bike hidden by default', () => {
    const { group } = buildShelterMesh(s)
    expect(group.getObjectByName('droneBox')?.visible).toBe(false)
    expect(group.getObjectByName('rod')?.visible).toBe(false)
    expect(group.getObjectByName('bike')?.visible).toBe(false)
  })

  it('shows and hides each one independently of the others', () => {
    const { group, setDroneBoxPlaced, setRodPlaced, setBikePlaced } = buildShelterMesh(s)
    setDroneBoxPlaced(true)
    expect(group.getObjectByName('droneBox')?.visible).toBe(true)
    expect(group.getObjectByName('rod')?.visible).toBe(false)
    expect(group.getObjectByName('bike')?.visible).toBe(false)
    setRodPlaced(true)
    setBikePlaced(true)
    expect(group.getObjectByName('rod')?.visible).toBe(true)
    expect(group.getObjectByName('bike')?.visible).toBe(true)
    setDroneBoxPlaced(false)
    expect(group.getObjectByName('droneBox')?.visible).toBe(false)
  })

  it('puts the empty drone box on the table, not loose in the room, and nothing else of the old diamond', () => {
    const { group } = buildShelterMesh(s)
    const table = group.getObjectByName('table')
    expect(group.getObjectByName('droneBox')?.parent).toBe(table)
    expect(group.getObjectByName('diamond')).toBeUndefined() // the diamond goes to the train now
  })

  it('parks the bike outside the hut by default, not in front of the door', () => {
    const { group, setBikePlaced } = buildShelterMesh({ x: 0, z: 0, y: 0, rotationY: 0 })
    setBikePlaced(true)
    group.updateMatrixWorld(true)
    const bike = group.getObjectByName('bike')!
    // Outside the hut's own footprint (DEPTH deep, so |z| > DEPTH/2, or off its
    // side), and never centred on the doorway.
    expect(Math.abs(bike.position.z) > DEPTH / 2 || Math.abs(bike.position.x) > 1.8).toBe(true)
    const box = new THREE.Box3().setFromObject(bike)
    expect(box.max.z < -DEPTH / 2 ? box.min.x > DOOR_WIDTH / 2 || box.max.x < -DOOR_WIDTH / 2 : true).toBe(true)
  })
})

describe('where the rod and the bicycle wait at home', () => {
  const huts = [
    { x: 0, z: 0, y: 0, rotationY: 0 },
    { x: 12, z: -7, y: 1, rotationY: 1.1 },
    { x: -30, z: 20, y: 0, rotationY: 4.0 },
  ]

  it.each(huts)('is where the rod actually stands in the hut, whichever way it faces: %o', (hut) => {
    const { group } = buildShelterMesh(hut)
    group.updateMatrixWorld(true)
    const at = group.getObjectByName('rod')!.getWorldPosition(new THREE.Vector3())
    const spot = rodSpotWorld(hut)
    expect(spot.x).toBeCloseTo(at.x, 5)
    expect(spot.z).toBeCloseTo(at.z, 5)
  })

  it.each(huts)('is where the bicycle actually stands, at each wall: %o', (hut) => {
    for (const wall of ['front', 'back', 'left', 'right'] as const) {
      const { group, setBikePlaced } = buildShelterMesh(hut)
      const bikeSpot = { wall, along: 0.3 }
      setBikePlaced(true, bikeSpot)
      group.updateMatrixWorld(true)
      const at = group.getObjectByName('bike')!.getWorldPosition(new THREE.Vector3())
      const spot = bikeSpotWorld(hut, bikeSpot)
      expect(spot.x).toBeCloseTo(at.x, 5)
      expect(spot.z).toBeCloseTo(at.z, 5)
    }
  })

  it('uses the default wall when none was chosen yet', () => {
    expect(bikeSpotWorld(huts[1])).toEqual(bikeSpotWorld(huts[1], DEFAULT_BIKE_SPOT))
  })

  it.each(huts)('puts the rod inside the hut and the bicycle outside it: %o', (hut) => {
    expect(insideHut(hut, rodSpotWorld(hut).x, rodSpotWorld(hut).z)).toBe(true)
    for (const wall of ['front', 'back', 'left', 'right'] as const) {
      const b = bikeSpotWorld(hut, { wall, along: 0 })
      expect(insideHut(hut, b.x, b.z)).toBe(false)
    }
  })

  it('knows the hut floor from its outside, rotated or not', () => {
    const hut = { x: 5, z: 5, y: 0, rotationY: 0.7 }
    expect(insideHut(hut, 5, 5)).toBe(true)
    expect(insideHut(hut, 5 + 6, 5)).toBe(false)
    expect(insideHut(hut, 5, 5 + 6)).toBe(false)
  })
})

describe('onHutFootprint', () => {
  const s = { x: 4, z: -2, y: 0, rotationY: 0.5 }
  it('covers the whole hut including its walls, and a margin past them', () => {
    expect(onHutFootprint(s, 4, -2)).toBe(true)
    const wall = doorPosition(s) // on the front wall's line
    expect(onHutFootprint(s, wall.x, wall.z)).toBe(true)
    expect(onHutFootprint(s, 4 + 3, -2)).toBe(false)
    expect(onHutFootprint(s, 4 + 2.1, -2, 0.5)).toBe(true)
  })
})
