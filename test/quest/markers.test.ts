import { buildMinimapMarkers, type Landmark } from '../../src/quest/markers'
import type { Quests } from '../../src/quest/types'

const questColor = { axe: '#111', lamp: '#222', rod: '#333', bike: '#444' }

const quest = (state: 'pending' | 'carrying' | 'done', x = 0, z = 0) => ({ position: { x, y: 0, z }, state })

const quests = (overrides: Partial<Quests> = {}): Quests =>
  ({
    axe: quest('pending', 1, 1),
    lamp: quest('pending', 2, 2),
    rod: quest('pending', 3, 3),
    bike: quest('pending', 4, 4),
    diamond: quest('pending', 5, 5),
    ...overrides,
  }) as Quests

const landmarks: Landmark[] = [{ position: { x: 0, z: 0 }, color: '#d8a04a' }]

describe('buildMinimapMarkers', () => {
  it('always includes landmarks, hints off', () => {
    const markers = buildMinimapMarkers(landmarks, quests(), false, questColor)
    expect(markers).toEqual([{ position: { x: 0, z: 0 }, color: '#d8a04a' }])
  })

  it('always includes landmarks, hints on', () => {
    const markers = buildMinimapMarkers(landmarks, quests(), true, questColor)
    expect(markers[0]).toEqual({ position: { x: 0, z: 0 }, color: '#d8a04a' })
  })

  it('adds no quest markers when hints are off, even if items are pending', () => {
    const markers = buildMinimapMarkers(landmarks, quests(), false, questColor)
    expect(markers).toHaveLength(1)
  })

  it('adds one marker per pending hintable item when hints are on', () => {
    const markers = buildMinimapMarkers(landmarks, quests(), true, questColor)
    expect(markers).toHaveLength(5)
    expect(markers).toContainEqual({ position: { x: 1, y: 0, z: 1 }, color: '#111' })
    expect(markers).toContainEqual({ position: { x: 4, y: 0, z: 4 }, color: '#444' })
  })

  it('never adds a marker for a carrying or done item', () => {
    const markers = buildMinimapMarkers(
      landmarks,
      quests({ axe: quest('carrying', 1, 1), rod: quest('done', 3, 3) }),
      true,
      questColor,
    )
    expect(markers).toHaveLength(3) // landmark + lamp + bike
    expect(markers.some((m) => m.color === '#111')).toBe(false)
    expect(markers.some((m) => m.color === '#333')).toBe(false)
  })

  it('never adds a marker for the diamond, even pending with hints on', () => {
    const markers = buildMinimapMarkers(landmarks, quests(), true, questColor)
    expect(markers.some((m) => m.position.x === 5 && m.position.z === 5)).toBe(false)
  })
})
