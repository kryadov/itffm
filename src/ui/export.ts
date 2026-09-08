/** One image cell's fixed size, pixels — same as the encyclopedia grid's own
 *  preview images, so the exported picture is a faithful copy, not a resize. */
const CELL = 180
/** Room below a cell for its name. */
const LABEL = 26
const GAP = 16
const MARGIN = 24
const HEADER = 60

export interface GridLayout {
  width: number
  height: number
  cellAt(i: number): { x: number; y: number }
}

/** How many columns a grid of this many cells should use — square-ish, but
 *  never so wide that a small find spreads across an unreasonably long strip. */
export function columnsFor(count: number): number {
  return Math.max(1, Math.min(6, Math.ceil(Math.sqrt(count))))
}

/**
 * Pure pixel layout for the exported encyclopedia image: a header band above
 * a grid of `count` cells, `cols` wide. Kept apart from the canvas drawing
 * itself (`ui/encyclopedia.ts`) so the arithmetic — a real, testable thing —
 * is not tangled up with `Image`/`canvas`, neither of which exists in the
 * `node` test environment (see vite.config.ts).
 */
export function layoutGrid(count: number, cols: number): GridLayout {
  const rows = Math.max(1, Math.ceil(count / Math.max(1, cols)))
  const width = MARGIN * 2 + cols * CELL + (cols - 1) * GAP
  const height = HEADER + MARGIN * 2 + rows * (CELL + LABEL) + (rows - 1) * GAP
  return {
    width,
    height,
    cellAt(i: number) {
      const col = i % cols
      const row = Math.floor(i / cols)
      return {
        x: MARGIN + col * (CELL + GAP),
        y: HEADER + MARGIN + row * (CELL + LABEL + GAP),
      }
    },
  }
}

export const EXPORT_CELL_SIZE = CELL
