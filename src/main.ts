import * as THREE from 'three'

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
scene.background = new THREE.Color(0x8fb08a)
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 500)
camera.position.set(0, 0.4, 0.6)
camera.lookAt(0, 0.15, 0)

scene.add(new THREE.HemisphereLight(0xcfe3d0, 0x3b3327, 2))

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

renderer.setAnimationLoop(() => renderer.render(scene, camera))

window.__READY = true
