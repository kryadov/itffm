import { loadSpecies } from '../species/load'
import { hashString } from '../util/rng'
import { t, speciesName } from '../i18n/i18n'
import { renderCollectiblePreview } from './preview'
import { columnsFor, layoutGrid, EXPORT_CELL_SIZE } from './export'
import { matchesFilters, type EncyclopediaFilters, type Season } from './encyclopediaFilters'
import { EDIBILITY, HYMENIUM, BIOMES, KINDS } from '../species/schema'
import type { SaveData } from '../save/store'
import type { Biome, Edibility, HymeniumType, Kind, Species } from '../species/schema'

const KIND_LABEL: Record<Kind, 'kindMushroom' | 'kindBerry' | 'kindHerb' | 'kindNut' | 'kindFind'> = {
  mushroom: 'kindMushroom',
  berry: 'kindBerry',
  herb: 'kindHerb',
  nut: 'kindNut',
  find: 'kindFind',
}

const BIOME_LABEL: Record<Biome, { ru: string; en: string }> = {
  'forest-broadleaved': { ru: 'лиственный лес', en: 'broadleaf woods' },
  'forest-coniferous': { ru: 'хвойный лес', en: 'conifer woods' },
  'forest-mixed': { ru: 'смешанный лес', en: 'mixed woods' },
  'meadow-scrub': { ru: 'опушки и луга', en: 'edges and meadows' },
  'dunes-coast': { ru: 'дюны', en: 'dunes' },
  wetland: { ru: 'болото', en: 'wetland' },
  'cave-adit': { ru: 'штольни и пещеры', en: 'adits and caves' },
  'park-urban': { ru: 'парки', en: 'parks' },
  alpine: { ru: 'высокогорье', en: 'high mountains' },
}

/**
 * Draws the discovered species onto a plain 2D canvas — a picture worth
 * sharing, not the encyclopedia's own WebGL previews rearranged in place —
 * and triggers a normal browser download of it. Nothing here needs to be
 * fast: it runs once, on a deliberate click, for a species list that tops
 * out in the dozens.
 */
async function exportEncyclopediaImage(discovered: Species[]): Promise<void> {
  if (discovered.length === 0) return
  const cols = columnsFor(discovered.length)
  const layout = layoutGrid(discovered.length, cols)

  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#0f130e'
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.fillStyle = '#eee'
  ctx.font = '600 24px system-ui, sans-serif'
  ctx.fillText(`${t('encyclopedia')} — ${discovered.length}`, 24, 40)

  await Promise.all(
    discovered.map(
      (s, i) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            const { x, y } = layout.cellAt(i)
            ctx.drawImage(img, x, y, EXPORT_CELL_SIZE, EXPORT_CELL_SIZE)
            ctx.fillStyle = '#eee'
            ctx.font = '600 13px system-ui, sans-serif'
            ctx.fillText(speciesName(s), x, y + EXPORT_CELL_SIZE + 18, EXPORT_CELL_SIZE)
            resolve()
          }
          img.onerror = () => resolve()
          img.src = renderCollectiblePreview(s, hashString(s.id), 0.7, EXPORT_CELL_SIZE, false)
        }),
    ),
  )

  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = 'itffm-encyclopedia.png'
  a.click()
}

/** The encyclopedia: what has been found, and what is still out there. */
export function openEncyclopedia(save: SaveData, lang: 'ru' | 'en'): void {
  if (document.getElementById('encyclopedia')) return
  document.exitPointerLock()

  const overlay = document.createElement('div')
  overlay.id = 'encyclopedia'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130e;pointer-events:auto;overflow:auto;padding:34px 38px;font-family:system-ui,sans-serif;color:#eee'
  document.getElementById('ui')!.appendChild(overlay)

  const all = loadSpecies()
  const found = new Set(save.discovered)

  // Rendered once regardless of the filters below: a preview is a real
  // WebGL draw, and re-rendering all of them on every filter change would
  // make the encyclopedia stutter for no reason — only which cards show
  // changes, never how they look.
  const cardHtml = new Map<string, string>()
  for (const s of all) {
    const known = found.has(s.id)
    const preview = renderCollectiblePreview(s, hashString(s.id), 0.7, 180, !known)
    const where = s.ecology.biomes.map((b) => BIOME_LABEL[b][lang]).join(', ')
    cardHtml.set(
      s.id,
      `<div style="background:#171d15;border-radius:12px;padding:16px;text-align:center">
        <img src="${preview}" width="180" height="180" alt="" style="display:block;margin:0 auto 10px" />
        <div style="font-weight:600">${known ? speciesName(s) : t('unknown')}</div>
        <div style="font-size:13px;opacity:.55;${known ? 'font-style:italic' : ''};margin-top:3px">${known ? s.name.la : where}</div>
      </div>`,
    )
  }

  const selectOption = (value: string, label: string): string => `<option value="${value}">${label}</option>`
  const selectStyle =
    'padding:6px 10px;border-radius:6px;border:1px solid #444;background:#1a201a;color:#ddd;font-size:13px'

  const kindSelect = `<select id="filter-kind" style="${selectStyle}">
    ${selectOption('', t('filterAny'))}
    ${KINDS.map((k) => selectOption(k, t(KIND_LABEL[k]))).join('')}
  </select>`
  const biomeSelect = `<select id="filter-biome" style="${selectStyle}">
    ${selectOption('', t('filterAny'))}
    ${BIOMES.map((b) => selectOption(b, BIOME_LABEL[b][lang])).join('')}
  </select>`
  const edibilitySelect = `<select id="filter-edibility" style="${selectStyle}">
    ${selectOption('', t('filterAny'))}
    ${EDIBILITY.map((e) => selectOption(e, t(e))).join('')}
  </select>`
  const hymeniumSelect = `<select id="filter-hymenium" style="${selectStyle}">
    ${selectOption('', t('filterAny'))}
    ${HYMENIUM.map((h) => selectOption(h, t(h))).join('')}
  </select>`
  const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter']
  const seasonSelect = `<select id="filter-season" style="${selectStyle}">
    ${selectOption('', t('filterAny'))}
    ${seasons.map((s) => selectOption(s, t(s))).join('')}
  </select>`

  const labeled = (label: string, select: string): string =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:13px;opacity:.85">${label} ${select}</label>`

  overlay.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:8px">
      <h1 style="margin:0;font-size:28px">${t('encyclopedia')}</h1>
      <span style="opacity:.55">${found.size} ${t('of')} ${all.length}</span>
      <button id="export-encyclopedia" style="margin-left:auto;padding:6px 14px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:13px;cursor:pointer">${t('exportEncyclopedia')}</button>
      <span style="opacity:.5;font-size:14px">${t('closeHint')}</span>
    </div>
    <p style="margin:0 0 18px;padding:10px 14px;background:#2a1f14;border-left:3px solid #d8a04a;border-radius:0 6px 6px 0;font-size:13px;line-height:1.5;opacity:.9;max-width:760px">
      ${t('disclaimer')}
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px">
      ${labeled(t('filterKind'), kindSelect)}
      ${labeled(t('filterBiome'), biomeSelect)}
      ${labeled(t('filterEdibility'), edibilitySelect)}
      ${labeled(t('filterHymenium'), hymeniumSelect)}
      ${labeled(t('filterSeason'), seasonSelect)}
    </div>
    <div id="encyclopedia-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:16px"></div>
    <p id="encyclopedia-empty" hidden style="opacity:.6;font-size:14px">${t('noMatches')}</p>`

  const grid = overlay.querySelector<HTMLDivElement>('#encyclopedia-grid')!
  const empty = overlay.querySelector<HTMLParagraphElement>('#encyclopedia-empty')!
  const kindInput = overlay.querySelector<HTMLSelectElement>('#filter-kind')!
  const biomeInput = overlay.querySelector<HTMLSelectElement>('#filter-biome')!
  const edibilityInput = overlay.querySelector<HTMLSelectElement>('#filter-edibility')!
  const hymeniumInput = overlay.querySelector<HTMLSelectElement>('#filter-hymenium')!
  const seasonInput = overlay.querySelector<HTMLSelectElement>('#filter-season')!

  const renderGrid = (): void => {
    const filters: EncyclopediaFilters = {
      kind: (kindInput.value || undefined) as Kind | undefined,
      biome: (biomeInput.value || undefined) as Biome | undefined,
      edibility: (edibilityInput.value || undefined) as Edibility | undefined,
      hymenium: (hymeniumInput.value || undefined) as HymeniumType | undefined,
      season: (seasonInput.value || undefined) as Season | undefined,
    }
    const shown = all.filter((s) => matchesFilters(s, filters))
    grid.innerHTML = shown.map((s) => cardHtml.get(s.id)).join('')
    empty.hidden = shown.length > 0
  }

  for (const input of [kindInput, biomeInput, edibilityInput, hymeniumInput, seasonInput]) {
    input.addEventListener('change', renderGrid)
  }
  renderGrid()

  overlay.querySelector('#export-encyclopedia')!.addEventListener('click', () => {
    void exportEncyclopediaImage(all.filter((s) => found.has(s.id)))
  })

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'Tab' && e.code !== 'Escape') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}
