import * as THREE from 'three'
import { loadSpecies } from '../species/load'
import { buildMushroom } from '../mushroom/build'
import { hashString } from '../util/rng'
import { t, speciesName } from '../i18n/i18n'
import type { SaveData } from '../save/store'
import type { Species, Biome } from '../species/schema'

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
 * A preview of one species: the same generator as in the wood, rendered once to
 * an image.
 *
 * A live renderer per card would sink the browser, but a snapshot will not —
 * and the mushroom on the card is exactly the one the player will meet.
 */
function renderPreview(species: Species, size: number, silhouette: boolean): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(size, size)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(1, 2, 1.5)
  scene.add(key)

  const model = buildMushroom(species.morphology, hashString(species.id), 0.7)
  if (silhouette) {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = new THREE.MeshBasicMaterial({ color: 0x252c21 })
    })
  }
  const box = new THREE.Box3().setFromObject(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  scene.add(model)

  const extent = Math.max(...box.getSize(new THREE.Vector3()).toArray())
  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 10)
  camera.position.set(extent * 1.5, extent * 0.85, extent * 1.5)
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL()
  renderer.dispose()
  return url
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

  const cards = all
    .map((s) => {
      const known = found.has(s.id)
      const preview = renderPreview(s, 180, !known)
      const where = s.ecology.biomes.map((b) => BIOME_LABEL[b][lang]).join(', ')
      return `<div style="background:#171d15;border-radius:12px;padding:16px;text-align:center">
        <img src="${preview}" width="180" height="180" alt="" style="display:block;margin:0 auto 10px" />
        <div style="font-weight:600">${known ? speciesName(s) : t('unknown')}</div>
        <div style="font-size:13px;opacity:.55;${known ? 'font-style:italic' : ''};margin-top:3px">${known ? s.name.la : where}</div>
      </div>`
    })
    .join('')

  overlay.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:8px">
      <h1 style="margin:0;font-size:28px">${t('encyclopedia')}</h1>
      <span style="opacity:.55">${found.size} ${t('of')} ${all.length}</span>
      <span style="margin-left:auto;opacity:.5;font-size:14px">${t('closeHint')}</span>
    </div>
    <p style="margin:0 0 26px;padding:10px 14px;background:#2a1f14;border-left:3px solid #d8a04a;border-radius:0 6px 6px 0;font-size:13px;line-height:1.5;opacity:.9;max-width:760px">
      ${t('disclaimer')}
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:16px">${cards}</div>`

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'Tab' && e.code !== 'Escape') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}
