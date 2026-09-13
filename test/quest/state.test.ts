import { tryPickUp, tryDeliver, type Quest } from '../../src/quest/state'

const pos = { x: 10, y: 0, z: 10 }
const shelterDoor = { x: 0, z: 0 }

describe('tryPickUp', () => {
  it('picks up when pending and in range', () => {
    const quest: Quest = { position: pos, state: 'pending' }
    const next = tryPickUp(quest, { x: 10, z: 11 }, 2)
    expect(next.state).toBe('carrying')
  })

  it('leaves it alone when out of range', () => {
    const quest: Quest = { position: pos, state: 'pending' }
    const next = tryPickUp(quest, { x: 0, z: 0 }, 2)
    expect(next).toEqual(quest)
  })

  it('leaves it alone when not pending', () => {
    const quest: Quest = { position: pos, state: 'carrying' }
    const next = tryPickUp(quest, { x: 10, z: 10 }, 2)
    expect(next).toEqual(quest)
  })
})

describe('tryDeliver', () => {
  it('delivers when carrying and in range of the shelter door', () => {
    const quest: Quest = { position: pos, state: 'carrying' }
    const next = tryDeliver(quest, { x: 1, z: 0 }, shelterDoor, 2)
    expect(next.state).toBe('done')
  })

  it('leaves it alone when out of range', () => {
    const quest: Quest = { position: pos, state: 'carrying' }
    const next = tryDeliver(quest, { x: 20, z: 20 }, shelterDoor, 2)
    expect(next).toEqual(quest)
  })

  it('leaves it alone when not carrying', () => {
    const quest: Quest = { position: pos, state: 'pending' }
    const next = tryDeliver(quest, { x: 0, z: 0 }, shelterDoor, 2)
    expect(next).toEqual(quest)
  })
})
