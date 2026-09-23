import * as THREE from 'three'
import { mulberry32 } from '../util/rng'

export type Weather = 'clear' | 'rain' | 'snow' | 'fog'
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'fog']

/** What the player picks in settings: a fixed weather, or 'auto' — the wood's
 *  own changing weather (`autoWeather` below). */
export type WeatherMode = 'auto' | Weather
export const WEATHER_MODES: readonly WeatherMode[] = ['auto', ...WEATHERS]

/** The part of the day the auto weather draws from: rain belongs to the day,
 *  fog to the morning and evening, and a night is either clear or foggy. */
export type DayPart = 'night' | 'morning' | 'day' | 'evening'

/** Clock time (0 midnight, 0.5 noon — `world/daynight.ts`) → part of the day.
 *  Morning and evening are the stretches around dawn (0.24) and dusk (0.76). */
export function dayPart(t: number): DayPart {
  const tt = ((t % 1) + 1) % 1
  if (tt < 0.19 || tt >= 0.81) return 'night'
  if (tt < 0.32) return 'morning'
  if (tt < 0.68) return 'day'
  return 'evening'
}

/** How long one spell of auto weather lasts before it is drawn again, seconds.
 *  A new part of the day draws again straight away. */
export const WEATHER_SPELL_SECONDS = 180

/** Chances of the non-clear weather in each part of the day. */
const RAIN_BY_DAY = 0.4
const FOG_MORNING_EVENING = 0.55
const FOG_BY_NIGHT = 0.35

/**
 * The auto weather for spell number `spell` at clock time `t`: by day clear or
 * rain, in the morning and evening clear or fog, at night clear or fog. A pure
 * draw from (`seed`, `spell`, part of the day) — the same wood at the same
 * moment has the same weather for everyone, and no `Math.random` is involved.
 */
export function autoWeather(seed: number, spell: number, t: number): Weather {
  const part = dayPart(t)
  const partIndex = part === 'night' ? 0 : part === 'morning' ? 1 : part === 'day' ? 2 : 3
  const rng = mulberry32((seed * 7919 + spell * 104729 + partIndex * 31337) | 0)
  rng() // the first draw of a fresh mulberry32 tracks its seed too closely
  const roll = rng()
  if (part === 'day') return roll < RAIN_BY_DAY ? 'rain' : 'clear'
  if (part === 'night') return roll < FOG_BY_NIGHT ? 'fog' : 'clear'
  return roll < FOG_MORNING_EVENING ? 'fog' : 'clear'
}

/** Horizontal half-extent of the camera-local particle box, metres. */
const AREA = 40
const TOP = 30
const BOT = -15
/** Rain keeps to a tighter box than snow: a 1-pixel streak far off is
 *  invisible, so the drops are packed where they can be seen. The first
 *  version spread 500 over the whole snow box and a rainy wood showed one or
 *  two streaks on screen. */
const RAIN_AREA = 18
const RAIN_N = 1400
const SNOW_N = 700
/** Rain-drop streak length, metres. */
const STREAK = 1.2
const RAIN_OPACITY = 0.5
const SNOW_OPACITY = 0.8
/** Fog distances in thick fog, metres. */
const FOG_NEAR = 6
const FOG_FAR = 55
/** How far the view reaches in rain — greyer than a clear day, not a fog. */
const RAIN_FAR = 100
/** How fast a change of weather blends in, per second (an exponential ease):
 *  most of the way over about eight seconds. */
const BLEND_RATE = 0.3

export interface WeatherFx {
  group: THREE.Object3D
  /** `instant` (the default) snaps to it; otherwise it blends in over a few
   *  seconds of `update` — rain thickening, fog rolling in. */
  setWeather(w: Weather, instant?: boolean): void
  update(cam: THREE.Vector3, dt: number): void
  /** 0 under a clear sky, up to 1 in full rain: how much the sky is closed
   *  over, for dimming the sun. */
  overcast(): number
  /** 0 under a clear sky, 1 in thick fog: how much of the sky itself is hidden. */
  haze(): number
}

/**
 * Rain (line-segment streaks) and snow (points), kept in a camera-local box
 * so they always surround the view without batchy respawns — plus a
 * thick-fog mode that just tightens the scene's existing fog distance.
 *
 * Ported from race-the-city's app/weather.ts, shrunk from a driving game's
 * particle box to a walking one, and with `Math.random()` replaced by
 * `mulberry32(seed)` — the project has no undeterministic generation in
 * `src/` (see CLAUDE.md). Changing weather on its own is `autoWeather` above,
 * driven from `main.ts`; this only draws whatever it is told.
 */
export function buildWeather(seed: number, fog: THREE.Fog): WeatherFx {
  const rng = mulberry32(seed)
  const rnd = (): number => rng() * 2 - 1

  const rainPos = new Float32Array(RAIN_N * 6)
  const rainSpeed = new Float32Array(RAIN_N)
  for (let i = 0; i < RAIN_N; i++) {
    const x = rnd() * RAIN_AREA
    const z = rnd() * RAIN_AREA
    const y = rng() * (TOP - BOT) + BOT
    rainSpeed[i] = 25 + rng() * 18
    rainPos.set([x, y, z, x, y - STREAK, z], i * 6)
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rainMat = new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: RAIN_OPACITY })
  const rain = new THREE.LineSegments(rainGeo, rainMat)
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
  const snowMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: SNOW_OPACITY, depthWrite: false,
  })
  const snow = new THREE.Points(snowGeo, snowMat)
  snow.frustumCulled = false
  snow.visible = false

  const group = new THREE.Group()
  group.name = 'weather'
  group.add(rain, snow)

  const clearFog = { near: fog.near, far: fog.far }
  // How much of each weather is showing, 0..1, and how much it is heading for.
  const amount = { rain: 0, snow: 0, fog: 0 }
  const target = { rain: 0, snow: 0, fog: 0 }
  let t = 0

  const apply = (): void => {
    rain.visible = amount.rain > 0.01
    rainMat.opacity = RAIN_OPACITY * amount.rain
    snow.visible = amount.snow > 0.01
    snowMat.opacity = SNOW_OPACITY * amount.snow
    const rainFar = clearFog.far + (Math.min(RAIN_FAR, clearFog.far) - clearFog.far) * amount.rain
    fog.near = clearFog.near + (FOG_NEAR - clearFog.near) * amount.fog
    fog.far = rainFar + (FOG_FAR - rainFar) * amount.fog
  }

  return {
    group,
    setWeather(w, instant = true) {
      target.rain = w === 'rain' ? 1 : 0
      target.snow = w === 'snow' ? 1 : 0
      target.fog = w === 'fog' ? 1 : 0
      if (instant) {
        amount.rain = target.rain
        amount.snow = target.snow
        amount.fog = target.fog
        apply()
      }
    },
    overcast: () => Math.min(1, amount.rain + amount.snow * 0.7 + amount.fog * 0.5),
    haze: () => Math.min(1, amount.fog + amount.rain * 0.5 + amount.snow * 0.5),
    update(cam, dt) {
      t += dt
      if (amount.rain !== target.rain || amount.snow !== target.snow || amount.fog !== target.fog) {
        const k = 1 - Math.exp(-BLEND_RATE * dt)
        for (const key of ['rain', 'snow', 'fog'] as const) {
          amount[key] += (target[key] - amount[key]) * k
          if (Math.abs(target[key] - amount[key]) < 0.002) amount[key] = target[key]
        }
        apply()
      }
      if (rain.visible) {
        rain.position.copy(cam)
        for (let i = 0; i < RAIN_N; i++) {
          const j = i * 6
          const d = rainSpeed[i] * dt
          rainPos[j + 1] -= d
          rainPos[j + 4] -= d
          if (rainPos[j + 1] < BOT) {
            const x = rnd() * RAIN_AREA
            const z = rnd() * RAIN_AREA
            rainPos.set([x, TOP, z, x, TOP - STREAK, z], j)
          }
        }
        rainGeo.attributes.position.needsUpdate = true
      }
      if (snow.visible) {
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
