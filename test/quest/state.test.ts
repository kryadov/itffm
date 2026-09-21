import { tryPickUp, tryDeliver, tryTake, interact, type Quest } from '../../src/quest/state'

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

describe('tryTake', () => {
  const home = { x: 3, z: 4 }
  it('takes a delivered item back into your hands when you are at its place in the hut', () => {
    const quest: Quest = { position: pos, state: 'done' }
    expect(tryTake(quest, { x: 3, z: 5 }, home, 2).state).toBe('carrying')
  })

  it('leaves it where it is when you are out of range', () => {
    const quest: Quest = { position: pos, state: 'done' }
    expect(tryTake(quest, { x: 30, z: 5 }, home, 2)).toEqual(quest)
  })

  it('does nothing for an item that is not at home', () => {
    for (const state of ['pending', 'carrying'] as const) {
      const quest: Quest = { position: pos, state }
      expect(tryTake(quest, home, home, 2)).toEqual(quest)
    }
  })
})

describe('interact', () => {
  const door = { x: 0, z: 0 }
  const spots = { deliverAt: door, takeFrom: { x: 0.5, z: 0.5 } }
  const at = { x: 0.2, z: 0.2 } // right by the door AND by the item's place at home

  it('does exactly one transition per press', () => {
    // Standing at home: taking an item and delivering it back must not happen in one press.
    const home: Quest = { position: pos, state: 'done' }
    const taken = interact(home, at, spots, 2)
    expect(taken.state).toBe('carrying')
    // ...and it is a second, separate press that puts it back.
    expect(interact(taken, at, spots, 2).state).toBe('done')
  })

  it('picks up a pending item that is in range, and no more in the same press', () => {
    const q: Quest = { position: { x: 0.1, y: 0, z: 0.1 }, state: 'pending' }
    expect(interact(q, at, spots, 2).state).toBe('carrying') // not straight on to done, though the door is right here
  })

  it('delivers a carried item at the delivery point', () => {
    expect(interact({ position: pos, state: 'carrying' }, at, spots, 2).state).toBe('done')
  })

  it('cannot take an item that has no place at home (takeFrom null), such as the hatchet', () => {
    const q: Quest = { position: pos, state: 'done' }
    expect(interact(q, at, { deliverAt: door, takeFrom: null }, 2)).toEqual(q)
  })

  it('leaves everything alone out of range', () => {
    const far = { x: 50, z: 50 }
    for (const state of ['pending', 'carrying', 'done'] as const) {
      const q: Quest = { position: pos, state }
      expect(interact(q, far, spots, 2)).toEqual(q)
    }
  })
})
