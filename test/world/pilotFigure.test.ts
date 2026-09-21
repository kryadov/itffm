import * as THREE from 'three'
import { buildPilotFigure, buildPilotBeacon } from '../../src/world/pilotFigure'
import { LOOK } from '../../src/world/trees'

const box = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(o)
}

describe('buildPilotFigure', () => {
  // A live request (2026-09-21): while the quadcopter flies, the player has to be
  // seen on the ground as a little person, holding the controller.
  it('is a person: about human height, standing on the ground, narrow', () => {
    const { group } = buildPilotFigure()
    const b = box(group)
    const size = b.getSize(new THREE.Vector3())
    expect(size.y).toBeGreaterThan(1.55)
    expect(size.y).toBeLessThan(1.95)
    expect(b.min.y).toBeCloseTo(0, 2)
    expect(size.x).toBeLessThan(1)
    expect(size.z).toBeLessThan(1)
  })

  it('has legs, a body, arms, a head with a cap, and the controller in its hands', () => {
    const { group } = buildPilotFigure()
    for (const name of ['leg', 'torso', 'arm', 'head', 'cap', 'controller']) {
      expect(group.getObjectByName(name), name).toBeDefined()
    }
    const head = box(group.getObjectByName('head')!)
    const torso = box(group.getObjectByName('torso')!)
    expect(head.min.y).toBeGreaterThan(torso.max.y - 0.15) // the head is on top
    const controller = box(group.getObjectByName('controller')!)
    expect(controller.min.y).toBeGreaterThan(torso.min.y) // held up at the chest, not dangling
    expect(controller.max.y).toBeLessThan(head.min.y + 0.1)
  })

  it('faces forward, toward -z, like the player does at yaw 0', () => {
    const { group } = buildPilotFigure()
    const controller = box(group.getObjectByName('controller')!)
    const torso = box(group.getObjectByName('torso')!)
    expect(controller.min.z).toBeLessThan(torso.min.z) // held out in front of the chest
  })

  it('turns to watch the drone: the body toward it, the head up at it', () => {
    const { group, update } = buildPilotFigure()
    for (let i = 0; i < 120; i++) update(1 / 30, new THREE.Vector3(30, 20, 0)) // due +x, high
    group.updateMatrixWorld(true)
    // The controller (held out in front) now points toward +x.
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()))
    expect(front.x).toBeGreaterThan(0.9)
    const head = group.getObjectByName('head')!
    expect(head.rotation.x).toBeGreaterThan(0.2) // looking up
    expect(head.rotation.x).toBeLessThan(1.3)
  })

  it('does not spin on the spot for a drone directly overhead', () => {
    const { group, update } = buildPilotFigure()
    update(1 / 30, new THREE.Vector3(0, 30, 0))
    const before = group.rotation.y
    for (let i = 0; i < 30; i++) update(1 / 30, new THREE.Vector3(0.001, 30, 0.001))
    expect(Number.isFinite(group.rotation.y)).toBe(true)
    expect(Math.abs(group.rotation.y - before)).toBeLessThan(0.5)
  })

  it('follows the figure: aiming is relative to where it stands', () => {
    const { group, update } = buildPilotFigure()
    group.position.set(100, 5, -40)
    for (let i = 0; i < 120; i++) update(1 / 30, new THREE.Vector3(100, 5, -80)) // straight along -z from it
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(group.quaternion)
    expect(front.z).toBeLessThan(-0.9)
  })

  it('disposes without throwing', () => {
    const { dispose } = buildPilotFigure()
    expect(() => dispose()).not.toThrow()
  })
})

describe('buildPilotBeacon', () => {
  // Seen from above the canopy the pilot is hidden by the trees, so a marker
  // stands over them, tall enough to show above the tallest tree.
  const tallest = Math.max(...Object.values(LOOK).map((l) => l.height[1]))

  it('is a slim pole standing on the ground that clears the tallest tree', () => {
    const b = buildPilotBeacon()
    const box = new THREE.Box3().setFromObject(b)
    const size = box.getSize(new THREE.Vector3())
    expect(b.name).toBe('pilotBeacon')
    expect(box.min.y).toBeCloseTo(0, 2)
    expect(size.y).toBeGreaterThan(tallest + 4)
    expect(size.x).toBeLessThan(2)
    expect(size.z).toBeLessThan(2)
  })

  it('is drawn bright and unlit, so it shows in any light and any weather', () => {
    const b = buildPilotBeacon()
    let unlit = 0
    b.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) unlit++
    })
    expect(unlit).toBeGreaterThanOrEqual(2)
    expect(b.getObjectByName('flag')).toBeDefined()
  })
})
