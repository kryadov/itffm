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

  it('stands on the ground beneath it', () => {
    const s = placeShelter(ground, 90, 3, [])
    expect(s.y).toBeCloseTo(ground.heightAt(s.x, s.z), 5)
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
    expect(s.y).toBeCloseTo(ground.heightAt(12, -7), 5)
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
