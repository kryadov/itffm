import * as THREE from 'three'
import { createForest, HALF_SIZE } from './game/scene'
import { createControls } from './game/controls'
import { stepPlayer, eyeHeight, type PlayerState, type Obstacle } from './game/player'

declare global {
  // boot-check waits on __READY: it is set only if the module ran to the end.
  // __BOOTCHECK tells us we are inside that headless run, where an endless
  // animation loop never lets the virtual-time budget settle and the check
  // hangs instead of reporting.
  interface Window { __READY?: boolean; __BOOTCHECK?: boolean }
}

/** Beyond this a mushroom is a pixel; drawing it costs a call for nothing. */
const MUSHROOM_DRAW_DISTANCE = 45

const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
app.appendChild(renderer.domElement)

const forest = createForest(2026)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 300)
const controls = createControls(renderer.domElement)

const obstacles: Obstacle[] = forest.trees.map((t) => ({ x: t.x, z: t.z, radius: t.radius }))
let player: PlayerState = { x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0 }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

let last = performance.now()
renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  player = stepPlayer(player, controls.read(dt), forest.ground, obstacles)
  player.x = Math.max(-HALF_SIZE, Math.min(HALF_SIZE, player.x))
  player.z = Math.max(-HALF_SIZE, Math.min(HALF_SIZE, player.z))

  camera.position.set(player.x, forest.ground.heightAt(player.x, player.z) + eyeHeight(player), player.z)
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')

  cullDistantMushrooms()
  renderer.render(forest.scene, camera)

  // One frame is all boot-check needs, and all it can afford.
  if (window.__BOOTCHECK) renderer.setAnimationLoop(null)
})

function cullDistantMushrooms(): void {
  const limit = MUSHROOM_DRAW_DISTANCE * MUSHROOM_DRAW_DISTANCE
  for (const m of forest.mushroomObjects) {
    const dx = m.position.x - player.x
    const dz = m.position.z - player.z
    m.visible = dx * dx + dz * dz < limit
  }
}

window.__READY = true
