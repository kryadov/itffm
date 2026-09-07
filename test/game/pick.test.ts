import { createBasket } from '../../src/game/pick'
import type { Placement } from '../../src/ecology/spawn'

const item = (id: string): Placement => ({
  speciesId: id,
  x: 0,
  z: 0,
  y: 0,
  rotationY: 0,
  age: 0.5,
  seed: 1,
})

describe('createBasket', () => {
  it('starts empty', () => {
    expect(createBasket().items).toHaveLength(0)
  })

  it('takes mushrooms', () => {
    const b = createBasket()
    expect(b.add(item('boletus-edulis'))).toBe(true)
    expect(b.items).toHaveLength(1)
  })

  it('fills up and then refuses more', () => {
    const b = createBasket(2)
    b.add(item('a'))
    b.add(item('b'))
    expect(b.full).toBe(true)
    expect(b.add(item('c'))).toBe(false)
    expect(b.items).toHaveLength(2)
  })

  it('keeps the same mushroom twice — a basket is not a checklist', () => {
    const b = createBasket()
    b.add(item('boletus-edulis'))
    b.add(item('boletus-edulis'))
    expect(b.items).toHaveLength(2)
  })
})
