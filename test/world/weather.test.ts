import * as THREE from 'three'
import { buildWeather } from '../../src/world/weather'

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
