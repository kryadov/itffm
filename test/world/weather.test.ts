import * as THREE from 'three'
import { buildWeather, autoWeather, dayPart } from '../../src/world/weather'

const makeFog = (): THREE.Fog => new THREE.Fog(0xa8c0a2, 30, 140)

describe('buildWeather', () => {
  it('is deterministic', () => {
    const a = buildWeather(7, makeFog())
    const b = buildWeather(7, makeFog())
    const rainA = (a.group.children[0] as THREE.LineSegments).geometry.getAttribute('position').array
    const rainB = (b.group.children[0] as THREE.LineSegments).geometry.getAttribute('position').array
    expect(rainA).toEqual(rainB)
  })

  it('draws a different layout for a different seed', () => {
    const a = buildWeather(1, makeFog())
    const b = buildWeather(2, makeFog())
    const rainA = (a.group.children[0] as THREE.LineSegments).geometry.getAttribute('position').array
    const rainB = (b.group.children[0] as THREE.LineSegments).geometry.getAttribute('position').array
    expect(rainA).not.toEqual(rainB)
  })

  it('hides both particle layers under clear skies', () => {
    const weather = buildWeather(7, makeFog())
    expect(weather.group.children[0].visible).toBe(false)
    expect(weather.group.children[1].visible).toBe(false)
  })

  it('shows only rain in rain, only snow in snow', () => {
    const weather = buildWeather(7, makeFog())
    weather.setWeather('rain')
    expect(weather.group.children[0].visible).toBe(true)
    expect(weather.group.children[1].visible).toBe(false)
    weather.setWeather('snow')
    expect(weather.group.children[0].visible).toBe(false)
    expect(weather.group.children[1].visible).toBe(true)
  })

  it('tightens the fog distance for fog and restores it for clear', () => {
    const fog = makeFog()
    const weather = buildWeather(7, fog)
    weather.setWeather('fog')
    expect(fog.far).toBeLessThan(140)
    weather.setWeather('clear')
    expect(fog.far).toBe(140)
    expect(fog.near).toBe(30)
  })

  it('moves rain drops downward over time', () => {
    const weather = buildWeather(7, makeFog())
    weather.setWeather('rain')
    const rain = weather.group.children[0] as THREE.LineSegments
    const before = (rain.geometry.getAttribute('position').array as Float32Array)[1]
    weather.update(new THREE.Vector3(), 0.1)
    const after = (rain.geometry.getAttribute('position').array as Float32Array)[1]
    expect(after).toBeLessThan(before)
  })
})

describe('dayPart', () => {
  it('splits the clock into night, morning, day and evening', () => {
    expect(dayPart(0)).toBe('night')
    expect(dayPart(0.25)).toBe('morning')
    expect(dayPart(0.5)).toBe('day')
    expect(dayPart(0.75)).toBe('evening')
    expect(dayPart(0.95)).toBe('night')
  })
})

describe('autoWeather', () => {
  const draws = (t: number): Set<string> => {
    const seen = new Set<string>()
    for (let spell = 0; spell < 200; spell++) seen.add(autoWeather(42, spell, t))
    return seen
  }

  it('is clear or rain by day, and both happen', () => {
    expect(draws(0.5)).toEqual(new Set(['clear', 'rain']))
  })

  it('is clear or fog in the morning and the evening', () => {
    expect(draws(0.26)).toEqual(new Set(['clear', 'fog']))
    expect(draws(0.74)).toEqual(new Set(['clear', 'fog']))
  })

  it('is clear or fog at night, never rain or snow', () => {
    expect(draws(0.02)).toEqual(new Set(['clear', 'fog']))
  })

  it('is the same for the same seed, spell and time', () => {
    for (let spell = 0; spell < 20; spell++) {
      expect(autoWeather(5, spell, 0.5)).toBe(autoWeather(5, spell, 0.5))
    }
  })

  it('changes from spell to spell rather than sticking', () => {
    const seq = Array.from({ length: 40 }, (_, s) => autoWeather(9, s, 0.5))
    const changes = seq.filter((w, i) => i > 0 && w !== seq[i - 1]).length
    expect(changes).toBeGreaterThan(5)
  })
})

describe('buildWeather blending', () => {
  it('rolls fog in gradually when not instant, and all the way in the end', () => {
    const fog = makeFog()
    const weather = buildWeather(7, fog)
    weather.setWeather('fog', false)
    expect(fog.far).toBe(140)
    weather.update(new THREE.Vector3(), 1)
    expect(fog.far).toBeLessThan(140)
    expect(fog.far).toBeGreaterThan(55)
    for (let i = 0; i < 60; i++) weather.update(new THREE.Vector3(), 1)
    expect(fog.far).toBe(55)
  })

  it('fades rain in, and reports the sky as overcast under it', () => {
    const weather = buildWeather(7, makeFog())
    expect(weather.overcast()).toBe(0)
    weather.setWeather('rain', false)
    weather.update(new THREE.Vector3(), 0.5)
    const rain = weather.group.children[0] as THREE.LineSegments
    expect(rain.visible).toBe(true)
    expect((rain.material as THREE.LineBasicMaterial).opacity).toBeLessThan(0.25)
    for (let i = 0; i < 60; i++) weather.update(new THREE.Vector3(), 1)
    expect(weather.overcast()).toBe(1)
  })
})
