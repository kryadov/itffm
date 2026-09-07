import * as THREE from 'three'
import { loadSpecies } from './species/load'
import { buildMushroom } from './mushroom/build'
import { attachOrbit } from './ui/orbit'

declare global {
  // boot-check waits on this flag: it is set only if the module ran to the end.
  interface Window { __READY?: boolean }
}

const app = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9db89a)
scene.add(new THREE.HemisphereLight(0xdfeede, 0x3b3327, 2.2))
const sun = new THREE.DirectionalLight(0xfff3d6, 1.6)
sun.position.set(1, 2, 1)
scene.add(sun)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 1 }),
)
ground.rotation.x = -Math.PI / 2
scene.add(ground)

const species = loadSpecies()
const STEP = 0.35
species.forEach((s, i) => {
  const g = buildMushroom(s.morphology, i + 1, 0.6)
  g.position.x = (i - (species.length - 1) / 2) * STEP
  scene.add(g)
})

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 100)
attachOrbit(camera, renderer.domElement, new THREE.Vector3(0, 0.08, 0), 0.9)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

renderer.setAnimationLoop(() => renderer.render(scene, camera))

window.__READY = true
