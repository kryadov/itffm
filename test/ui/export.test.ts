import { columnsFor, layoutGrid, EXPORT_CELL_SIZE } from '../../src/ui/export'

describe('columnsFor', () => {
  it('never returns fewer than one column', () => {
    expect(columnsFor(0)).toBeGreaterThanOrEqual(1)
    expect(columnsFor(1)).toBe(1)
  })

  it('grows roughly with the square root of the count', () => {
    expect(columnsFor(4)).toBe(2)
    expect(columnsFor(9)).toBe(3)
  })

  it('caps out rather than spreading arbitrarily wide', () => {
    expect(columnsFor(1000)).toBeLessThanOrEqual(6)
  })
})

describe('layoutGrid', () => {
  it('fits exactly the requested number of columns', () => {
    const layout = layoutGrid(10, 4)
    // Every cell in the first row should be within the canvas width.
    for (let i = 0; i < 4; i++) {
      expect(layoutGrid(10, 4).cellAt(i).x + EXPORT_CELL_SIZE).toBeLessThanOrEqual(layout.width)
    }
  })

  it('places consecutive cells in reading order: left to right, then down', () => {
    const layout = layoutGrid(6, 3)
    const a = layout.cellAt(0)
    const b = layout.cellAt(1)
    const c = layout.cellAt(3)
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBe(a.y)
    expect(c.y).toBeGreaterThan(a.y)
    expect(c.x).toBe(a.x)
  })

  it('grows the canvas height with more rows', () => {
    const few = layoutGrid(3, 3)
    const many = layoutGrid(9, 3)
    expect(many.height).toBeGreaterThan(few.height)
  })

  it('never divides by zero for an empty collection', () => {
    expect(() => layoutGrid(0, columnsFor(0))).not.toThrow()
  })

  it('gives every cell a positive position within the canvas', () => {
    const count = 7
    const layout = layoutGrid(count, columnsFor(count))
    for (let i = 0; i < count; i++) {
      const { x, y } = layout.cellAt(i)
      expect(x).toBeGreaterThan(0)
      expect(y).toBeGreaterThan(0)
      expect(x + EXPORT_CELL_SIZE).toBeLessThanOrEqual(layout.width)
    }
  })
})
