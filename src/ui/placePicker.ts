import * as THREE from 'three'
import { t, getLang } from '../i18n/i18n'
import { POPULAR_PLACES } from './popularPlaces'
import { WORLD_SIZES, DEFAULT_WORLD_SIZE } from './worldSize'
import { buildCollectible } from '../collectible/build'
import { speciesById } from '../species/load'
import { hashString } from '../util/rng'

/**
 * The place-picker screen: name a real wood, or walk into the baked demo one.
 *
 * OpenStreetMap and AWS Terrain Tiles attribution sits here, visible before the
 * player ever presses a key — their licences require it, and it should not be
 * something to go hunting for in an "about" screen nobody opens. Attribution
 * text itself stays in English regardless of interface language, matching how
 * most software credits its data sources.
 */
export function openPlacePicker(onPick: (query: string | null, halfSize: number) => void): void {
  const overlay = document.createElement('div')
  overlay.id = 'place-picker'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130e;pointer-events:auto;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee;gap:18px;padding:24px'

  const sizeOptions = WORLD_SIZES.map(
    (o) =>
      `<option value="${o.id}" ${o.id === DEFAULT_WORLD_SIZE.id ? 'selected' : ''}>${getLang() === 'ru' ? o.ru : o.en}</option>`,
  ).join('')

  overlay.innerHTML = `
    <h1 style="margin:0;font-size:28px">itffm</h1>
    <p style="margin:0;opacity:.75;max-width:420px;text-align:center;line-height:1.5">${t('placeIntro')}</p>
    <input id="place-input" type="text" placeholder="${t('placePlaceholder')}"
      style="width:min(420px,90vw);padding:11px 14px;font-size:16px;border-radius:8px;border:1px solid #444;background:#1a201a;color:#eee" />
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;opacity:.8">${t('placeSize')}
      <select id="place-size" style="padding:6px 10px;border-radius:6px;border:1px solid #444;background:#1a201a;color:#ddd;font-size:13px">${sizeOptions}</select>
    </label>
    <div style="display:flex;gap:12px;margin-top:4px">
      <button id="place-go" style="padding:11px 22px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-weight:600;font-size:15px;cursor:pointer">${t('placeGo')}</button>
      <button id="place-demo" style="padding:11px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:15px;cursor:pointer">${t('placeDemo')}</button>
    </div>
    <p style="margin:8px 0 0;opacity:.6;font-size:13px">${t('placePopular')}</p>
    <div id="place-popular" style="display:flex;flex-wrap:wrap;gap:8px;max-width:520px;justify-content:center"></div>
    <p style="position:fixed;bottom:10px;opacity:.4;font-size:11px;text-align:center;max-width:600px">
      Terrain © <a href="https://registry.opendata.aws/terrain-tiles/" style="color:inherit">AWS Terrain Tiles</a>.
      Map data © <a href="https://www.openstreetmap.org/copyright" style="color:inherit">OpenStreetMap</a> contributors, ODbL.
    </p>`

  document.getElementById('ui')!.appendChild(overlay)

  const input = overlay.querySelector<HTMLInputElement>('#place-input')!
  const sizeInput = overlay.querySelector<HTMLSelectElement>('#place-size')!
  const chosenHalfSize = (): number =>
    (WORLD_SIZES.find((o) => o.id === sizeInput.value) ?? DEFAULT_WORLD_SIZE).halfSize

  const go = () => {
    const q = input.value.trim()
    const halfSize = chosenHalfSize()
    overlay.remove()
    onPick(q.length > 0 ? q : null, halfSize)
  }

  overlay.querySelector('#place-go')!.addEventListener('click', go)
  input.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') go()
  })
  overlay.querySelector('#place-demo')!.addEventListener('click', () => {
    const halfSize = chosenHalfSize()
    overlay.remove()
    onPick(null, halfSize)
  })

  const popular = overlay.querySelector<HTMLDivElement>('#place-popular')!
  for (const place of POPULAR_PLACES) {
    const button = document.createElement('button')
    button.textContent = getLang() === 'ru' ? place.ru : place.en
    button.style.cssText =
      'padding:7px 14px;border:1px solid #444;border-radius:16px;background:#1a201a;color:#ccc;font-size:13px;cursor:pointer'
    button.addEventListener('click', () => {
      const halfSize = chosenHalfSize()
      overlay.remove()
      onPick(place.query, halfSize)
    })
    popular.appendChild(button)
  }
}

/**
 * A loading screen with a stage message, a slowly turning mushroom and a
 * progress bar advancing by stage number — the same generator as the
 * encyclopedia and inspection views, so the thing spinning here is a real
 * mushroom from the database, not a placeholder icon.
 *
 * @param fraction how far along the four load stages we are, 0..1
 */
export function showLoading(message: string, fraction: number): { update(m: string, fraction: number): void; close(): void } {
  const overlay = document.createElement('div')
  overlay.id = 'loading'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130e;pointer-events:auto;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee;gap:16px'

  const canvasWrap = document.createElement('div')
  canvasWrap.style.cssText = 'width:140px;height:140px'
  const text = document.createElement('p')
  text.style.cssText = 'opacity:.8;font-size:15px;margin:0'
  text.textContent = message
  const barTrack = document.createElement('div')
  barTrack.style.cssText = 'width:220px;height:4px;border-radius:2px;background:#2a332a;overflow:hidden'
  const bar = document.createElement('div')
  bar.style.cssText = 'height:100%;background:#7ec46b;border-radius:2px;transition:width .3s ease'
  barTrack.appendChild(bar)
  overlay.append(canvasWrap, text, barTrack)
  document.getElementById('ui')!.appendChild(overlay)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(140, 140)
  canvasWrap.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.3)
  key.position.set(1, 2, 1.5)
  scene.add(key)

  // Fly agaric: the one mushroom silhouette everyone already recognises,
  // which is exactly what a loading mascot needs to be legible at a glance.
  const species = speciesById('amanita-muscaria')!
  const model = buildCollectible(species, hashString(species.id), 0.7)
  const box = new THREE.Box3().setFromObject(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  scene.add(model)

  const extent = Math.max(...box.getSize(new THREE.Vector3()).toArray())
  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 10)
  camera.position.set(extent * 1.6, extent * 1.1, extent * 1.6)
  camera.lookAt(0, 0, 0)

  const setBar = (f: number) => {
    bar.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`
  }
  setBar(fraction)

  renderer.setAnimationLoop(() => {
    model.rotation.y += 0.02
    renderer.render(scene, camera)
  })

  return {
    update(m: string, f: number) {
      text.textContent = m
      setBar(f)
    },
    close() {
      renderer.setAnimationLoop(null)
      renderer.dispose()
      overlay.remove()
    },
  }
}
