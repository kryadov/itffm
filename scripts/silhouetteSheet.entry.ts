// Dev-only harness for scripts/silhouette-sheet.mjs — not part of the game
// bundle (nothing in index.html references this). Draws every species in
// data/species/*.yaml as a flat silhouette (ui/preview.ts's own silhouette
// mode, the same one the encyclopedia already uses for an undiscovered
// species) onto one contact sheet, so a chimeric-proportions or
// sideways-stipe bug (see CLAUDE.md's Conventions — this project has hit
// both before, invisible to the tests that already existed) shows up across
// the whole roster in one look, not one screenshot per species by hand.
import { loadSpecies } from '../src/species/load'
import { renderCollectiblePreview } from '../src/ui/preview'
import { columnsFor, layoutGrid, EXPORT_CELL_SIZE } from '../src/ui/export'
import { hashString } from '../src/util/rng'

async function main(): Promise<void> {
  const species = loadSpecies()
  const cols = columnsFor(species.length)
  const layout = layoutGrid(species.length, cols)

  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0f130e'
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.fillStyle = '#eee'
  ctx.font = '600 22px system-ui, sans-serif'
  ctx.fillText(`Silhouette sheet — ${species.length} species`, 24, 38)

  await Promise.all(
    species.map(
      (s, i) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const { x, y } = layout.cellAt(i)
            ctx.drawImage(img, x, y, EXPORT_CELL_SIZE, EXPORT_CELL_SIZE)
            ctx.fillStyle = '#eee'
            ctx.font = '600 12px system-ui, sans-serif'
            ctx.fillText(s.id, x, y + EXPORT_CELL_SIZE + 16, EXPORT_CELL_SIZE)
            resolve()
          }
          img.onerror = () => resolve()
          // Fixed age (0.7 — mid-grown, the same default the basket/encyclopedia
          // previews use) so every specimen is comparable; seed from the
          // species id, deterministic, same as the encyclopedia's own preview.
          img.src = renderCollectiblePreview(s, hashString(s.id), 0.7, EXPORT_CELL_SIZE, true)
        }),
    ),
  )

  document.body.appendChild(canvas)
  document.title = 'SHEET_READY'
}

void main()
