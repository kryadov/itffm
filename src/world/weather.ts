import * as THREE from 'three'
import { mulberry32 } from '../util/rng'

export type Weather = 'clear' | 'rain' | 'snow' | 'fog'
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'fog']

/** Horizontal half-extent of the camera-local particle box, metres. */
const AREA = 40
const TOP = 30
const BOT = -15
const RAIN_N = 500
const SNOW_N = 700
/** Rain-drop streak length, metres. */
const STREAK = 1.2

export interface WeatherFx {
  group: THREE.Object3D
  setWeather(w: Weather): void
  update(cam: THREE.Vector3, dt: number): void
}

/**
 * Rain (line-segment streaks) and snow (points), kept in a camera-local box
 * so they always surround the view without batchy respawns — plus a
 * thick-fog mode that just tightens the scene's existing fog distance.
 *
 * Ported from race-the-city's app/weather.ts, shrunk from a driving game's
 * particle box to a walking one, and with `Math.random()` replaced by
 * `mulberry32(seed)` — the project has no undeterministic generation in
 * `src/` (see CLAUDE.md). The 'auto' cycling setting from the original
 * (weather changing on its own over time) is left out for now: a player
 * picks a fixed weather in settings, the way they pick a fixed time of day.
 */
export function buildWeather(seed: number, fog: THREE.Fog): WeatherFx {
  const rng = mulberry32(seed)
  const rnd = (): number => rng() * 2 - 1

  const rainPos = new Float32Array(RAIN_N * 6)
  const rainSpeed = new Float32Array(RAIN_N)
  for (let i = 0; i < RAIN_N; i++) {
    const x = rnd() * AREA
    const z = rnd() * AREA
    const y = rng() * (TOP - BOT) + BOT
    rainSpeed[i] = 25 + rng() * 18
    rainPos.set([x, y, z, x, y - STREAK, z], i * 6)
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.4 }),
  )
  rain.frustumCulled = false
  rain.visible = false

  const snowPos = new Float32Array(SNOW_N * 3)
  const snowSpeed = new Float32Array(SNOW_N)
  const snowPhase = new Float32Array(SNOW_N)
  for (let i = 0; i < SNOW_N; i++) {
    snowPos.set([rnd() * AREA, rng() * (TOP - BOT) + BOT, rnd() * AREA], i * 3)
    snowSpeed[i] = 1.4 + rng() * 1.6
    snowPhase[i] = rng() * Math.PI * 2
  }
  const snowGeo = new THREE.BufferGeometry()
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
  const snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({
      color: 0xffffff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false,
    }),
  )
  snow.frustumCulled = false
  snow.visible = false

  const group = new THREE.Group()
  group.name = 'weather'
  group.add(rain, snow)

  const clearFog = { near: fog.near, far: fog.far }
  let current: Weather = 'clear'
  let t = 0

  return {
    group,
    setWeather(w) {
      current = w
      rain.visible = w === 'rain'
      snow.visible = w === 'snow'
      if (w === 'fog') {
        fog.near = 6
        fog.far = 55
      } else {
        fog.near = clearFog.near
        fog.far = clearFog.far
      }
    },
    update(cam, dt) {
      t += dt
      if (current === 'rain') {
        rain.position.copy(cam)
        for (let i = 0; i < RAIN_N; i++) {
          const j = i * 6
          const d = rainSpeed[i] * dt
          rainPos[j + 1] -= d
          rainPos[j + 4] -= d
          if (rainPos[j + 1] < BOT) {
            const x = rnd() * AREA
            const z = rnd() * AREA
            rainPos.set([x, TOP, z, x, TOP - STREAK, z], j)
          }
        }
        rainGeo.attributes.position.needsUpdate = true
      } else if (current === 'snow') {
        snow.position.copy(cam)
        for (let i = 0; i < SNOW_N; i++) {
          const j = i * 3
          snowPos[j + 1] -= snowSpeed[i] * dt
          snowPos[j] += Math.sin(t * 1.5 + snowPhase[i]) * 0.3 * dt
          if (snowPos[j + 1] < BOT) {
            snowPos[j] = rnd() * AREA
            snowPos[j + 1] = TOP
            snowPos[j + 2] = rnd() * AREA
          }
        }
        snowGeo.attributes.position.needsUpdate = true
      }
    },
  }
}
