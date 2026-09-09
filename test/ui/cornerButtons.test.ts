import { cornerRight, CORNER_EDGE, CORNER_SIZE, CORNER_GAP } from '../../src/ui/cornerButtons'

describe('cornerRight', () => {
  it('sits the first button flush against the edge — the existing settings gear', () => {
    expect(cornerRight(0)).toBe(CORNER_EDGE)
  })

  it('packs each next button one width-plus-gap further in', () => {
    expect(cornerRight(1)).toBe(CORNER_EDGE + CORNER_SIZE + CORNER_GAP)
    expect(cornerRight(2)).toBe(CORNER_EDGE + 2 * (CORNER_SIZE + CORNER_GAP))
  })

  it('never lets adjacent buttons overlap', () => {
    for (let i = 0; i < 5; i++) {
      expect(cornerRight(i + 1) - cornerRight(i)).toBeGreaterThanOrEqual(CORNER_SIZE)
    }
  })

  it('marches monotonically inward from the edge', () => {
    expect(cornerRight(0)).toBeLessThan(cornerRight(1))
    expect(cornerRight(1)).toBeLessThan(cornerRight(2))
  })
})
