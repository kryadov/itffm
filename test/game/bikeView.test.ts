import * as THREE from 'three'
import { createBikeView } from '../../src/game/bikeView'
import { ROLLING_RADIUS } from '../../src/game/bikeSteer'

function world() {
  const scene = new THREE.Scene()
  const hemi = new THREE.HemisphereLight(0xe6f2e0, 0x6b6a4a, 2.6)
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.1)
  sun.position.set(40, 80, 20)
  scene.add(hemi, sun, sun.target)
  return { scene, hemi, sun }
}

function camera(x = 3, y = 1.6, z = -2, yaw = 0.7) {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.02, 2000)
  cam.position.set(x, y, z)
  cam.rotation.set(0, yaw, 0, 'YXZ')
  return cam
}

describe('createBikeView', () => {
  it('is hidden until told otherwise, and follows the setting', () => {
    const view = createBikeView(world().scene)
    expect(view.isVisible()).toBe(false)
    expect(view.group.visible).toBe(false)
    view.setVisible(true)
    expect(view.isVisible()).toBe(true)
    expect(view.group.visible).toBe(true)
    view.setVisible(false)
    expect(view.group.visible).toBe(false)
  })

  it('rides along with the camera, position and facing', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = camera()
    cam.updateMatrixWorld(true)
    view.update(1 / 60, 0.7, cam)
    expect(view.group.position.distanceTo(cam.position)).toBeLessThan(1e-9)
    expect(view.group.quaternion.angleTo(cam.quaternion)).toBeLessThan(1e-9)
  })

  it('puts the handlebar low in front of the eye, where the view shows it', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = camera(0, 0, 0, 0) // at the origin, looking down -z
    view.update(1 / 60, 0, cam)
    view.group.updateMatrixWorld(true)
    const bar = view.group.getObjectByName('handlebar')!.getWorldPosition(new THREE.Vector3())
    expect(bar.z).toBeLessThan(-0.3) // ahead of the eye
    expect(bar.y).toBeLessThan(0) // below it
    expect(Math.abs(bar.x)).toBeLessThan(0.05) // and centred
    // Inside the frame: within the camera's own view of it.
    cam.updateMatrixWorld(true)
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
    )
    expect(frustum.containsPoint(bar)).toBe(true)
  })

  it('shows the front wheel in front of, and below, the bar', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    view.update(1 / 60, 0, camera(0, 0, 0, 0))
    view.group.updateMatrixWorld(true)
    const bar = view.group.getObjectByName('handlebar')!.getWorldPosition(new THREE.Vector3())
    const wheel = view.group.getObjectByName('wheel')!.getWorldPosition(new THREE.Vector3())
    expect(wheel.z).toBeLessThan(bar.z)
    expect(wheel.y).toBeLessThan(bar.y)
  })

  it('shows the wheel itself, not just the fork: its middle and its top are on screen', () => {
    // A live request (2026-09-21): the wheel must be seen turning. It sat below the
    // bottom edge of the view, with only the fork showing.
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.02, 2000) // the game's own
    cam.position.set(0, 0, 0)
    cam.updateMatrixWorld(true)
    view.update(1 / 60, 0, cam)
    view.group.updateMatrixWorld(true)
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
    )
    const wheel = view.group.getObjectByName('wheel')!
    expect(frustum.containsPoint(wheel.getWorldPosition(new THREE.Vector3()))).toBe(true)
    // ...and a fair part of the wheel, not a sliver: the box around it is mostly inside.
    const box = new THREE.Box3().setFromObject(wheel)
    let inside = 0
    const corners = [box.min.x, box.max.x].flatMap((x) => [box.min.y, box.max.y].flatMap((y) => [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z))))
    for (const c of corners) if (frustum.containsPoint(c)) inside++
    expect(inside).toBeGreaterThanOrEqual(6)
  })

  it('turns the bar toward a turn, and only while turning', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = camera()
    let yaw = 0
    view.update(1 / 60, yaw, cam)
    expect(view.steerAngle()).toBe(0)
    for (let i = 0; i < 30; i++) {
      yaw += 0.04 // a steady turn to the left
      view.update(1 / 60, yaw, cam)
    }
    expect(view.steerAngle()).toBeGreaterThan(0.1)
    for (let i = 0; i < 30; i++) {
      yaw -= 0.04 // and back to the right
      view.update(1 / 60, yaw, cam)
    }
    expect(view.steerAngle()).toBeLessThan(-0.1)
    for (let i = 0; i < 120; i++) view.update(1 / 60, yaw, cam) // then stop
    expect(Math.abs(view.steerAngle())).toBeLessThan(0.01)
  })

  it('starts straight each time it is shown, whatever the last turn was', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = camera()
    for (let i = 1; i <= 20; i++) view.update(1 / 60, i * 0.05, cam)
    expect(Math.abs(view.steerAngle())).toBeGreaterThan(0.05)
    view.setVisible(false)
    expect(view.steerAngle()).toBe(0)
    view.setVisible(true)
    view.update(1 / 60, 9, cam) // a jump in yaw while hidden is not a turn
    expect(view.steerAngle()).toBe(0)
  })

  it('takes its light from the wood, so it is dark when the wood is', () => {
    const w = world()
    const view = createBikeView(w.scene)
    view.setVisible(true)
    const lights = () => {
      const found: THREE.Light[] = []
      // The view's own scene is its group's parent.
      view.group.parent!.traverse((o) => {
        if (o instanceof THREE.Light) found.push(o)
      })
      return found
    }
    w.hemi.intensity = 0.3
    w.sun.intensity = 0
    view.update(1 / 60, 0, camera())
    for (const l of lights()) expect(l.intensity).toBeLessThanOrEqual(0.3)
    w.hemi.intensity = 2.6
    w.sun.intensity = 1.1
    view.update(1 / 60, 0, camera())
    expect(lights().map((l) => l.intensity).sort()).toEqual([1.1, 2.6])
  })

  it('does not throw when there is no light in the wood at all', () => {
    const view = createBikeView(new THREE.Scene())
    view.setVisible(true)
    expect(() => view.update(1 / 60, 0, camera())).not.toThrow()
  })

  it('turns the front wheel with the speed you ride, backward when you back up, and not at all when you stop', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = camera()
    const rot = () => view.group.getObjectByName('wheel')!.rotation.z
    view.update(1 / 60, 0, cam, 0)
    const rest = rot()
    for (let i = 0; i < 60; i++) view.update(1 / 60, 0, cam, 4)
    const forward = rot()
    expect(forward).not.toBeCloseTo(rest, 2)
    // four metres of road on a wheel of rolling radius 0.349: about 11.5 radians
    const turned = ((forward - rest) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
    const expected = ((-4 / ROLLING_RADIUS) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
    expect(turned).toBeCloseTo(expected, 1)
    for (let i = 0; i < 60; i++) view.update(1 / 60, 0, cam, 0)
    expect(rot()).toBeCloseTo(forward, 6) // stopped: it stays as it is
    for (let i = 0; i < 60; i++) view.update(1 / 60, 0, cam, -4)
    expect(rot()).toBeCloseTo(rest, 4) // backed up as far as it came
  })

  it('does not turn while the bicycle is not in your hands', () => {
    const view = createBikeView(world().scene)
    const rot = () => view.group.getObjectByName('wheel')!.rotation.z
    const before = rot()
    for (let i = 0; i < 30; i++) view.update(1 / 60, 0, camera(), 6)
    expect(rot()).toBe(before)
  })

  it('keeps the wheel angle small however long you ride, and still steers while it turns', () => {
    const view = createBikeView(world().scene)
    view.setVisible(true)
    const cam = camera()
    let yaw = 0
    for (let i = 0; i < 20000; i++) {
      yaw += i < 30 ? 0.04 : 0
      view.update(1 / 60, yaw, cam, 9)
    }
    expect(Math.abs(view.group.getObjectByName('wheel')!.rotation.z)).toBeLessThanOrEqual(Math.PI + 1e-9)
    expect(view.steerAngle()).toBeCloseTo(0, 1) // the turn was long ago
  })
})
