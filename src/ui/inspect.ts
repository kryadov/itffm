import * as THREE from 'three'
import { buildCollectible } from '../collectible/build'
import { attachOrbit } from './orbit'
import { t, speciesName, speciesText } from '../i18n/i18n'
import type { Species, Edibility } from '../species/schema'

const EDIBILITY_COLOR: Record<Edibility, string> = {
  edible: '#7ec46b',
  conditional: '#d8c169',
  inedible: '#9a9a9a',
  poisonous: '#e08a4a',
  deadly: '#e2564a',
}

/**
 * A mushroom in your hands: the model turns, the card sits beside it.
 *
 * The player already knows the name — it was in the crosshair prompt. What this
 * screen is for is everything else: seeing the volva and the ring with your own
 * eyes, reading what the thing grows on, and being told which dangerous species
 * it could be confused with. That is the learning the whole game is for.
 */
export function openInspect(
  species: Species,
  seed: number,
  age: number,
  onCollect: () => void,
  onLeave: () => void,
  onCut: () => void,
): void {
  document.exitPointerLock()

  const overlay = document.createElement('div')
  overlay.id = 'inspect'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(14,18,13,.94);pointer-events:auto;display:flex;font-family:system-ui,sans-serif;color:#eee'
  document.getElementById('ui')!.appendChild(overlay)

  const view = document.createElement('div')
  view.style.cssText = 'flex:1 1 55%;position:relative;cursor:grab'
  const card = document.createElement('div')
  card.style.cssText = 'flex:1 1 45%;max-width:480px;padding:32px 34px;overflow:auto'
  overlay.append(view, card)

  const label = (k: string) => t(k as Parameters<typeof t>[0])
  // Each kind reads its own trait list off its own morphology shape — kept
  // here, not in mushroom/build.ts or berry/build.ts, because it is
  // translated text, and those modules are pure core with no i18n dependency.
  let traitsHtml: string
  if (species.kind === 'mushroom') {
    const m = species.morphology
    const ringText = m.stipe.ring !== 'none' ? t('withRing') : t('noRing')
    const volvaText = m.stipe.volva !== 'none' ? `, ${t('withVolva')}` : ''
    traitsHtml = `
      <li>${t('capSize')}: ${m.cap.diameter[0]}–${m.cap.diameter[1]} ${t('mm')}</li>
      <li>${t('underside')}: ${label(m.hymenium.type)}</li>
      <li>${t('stipe')}: ${m.stipe.height[0]}–${m.stipe.height[1]} ${t('mm')}, ${ringText}${volvaText}</li>`
  } else if (species.kind === 'berry') {
    const m = species.morphology
    traitsHtml = `
      <li>${t('berrySize')}: ${m.diameter[0]}–${m.diameter[1]} ${t('mm')}</li>
      <li>${t('clusterSize')}: ${m.clusterSize[0]}–${m.clusterSize[1]}</li>`
  } else if (species.kind === 'herb') {
    const m = species.morphology
    traitsHtml = `
      <li>${t('herbHeight')}: ${m.height[0]}–${m.height[1]} ${t('mm')}</li>
      <li>${t('leafSize')}: ${m.leafSize[0]}–${m.leafSize[1]} ${t('mm')}</li>`
  } else {
    const m = species.morphology
    traitsHtml = `<li>${t('nutSize')}: ${m.size[0]}–${m.size[1]} ${t('mm')}</li>`
  }
  // Absent only for a non-food find (kind: 'find') — nothing to badge.
  const edibilityBadge = species.edibility
    ? `<div style="display:inline-block;padding:4px 12px;border-radius:14px;margin-bottom:20px;color:#12160f;font-weight:600;background:${EDIBILITY_COLOR[species.edibility]}">
        ${t(species.edibility)}
      </div>`
    : ''

  card.innerHTML = `
    <h1 style="margin:0 0 2px;font-size:26px">${speciesName(species)}</h1>
    <div style="opacity:.6;font-style:italic;margin-bottom:14px">${species.name.la}</div>
    ${edibilityBadge}
    <p style="line-height:1.55;opacity:.9;margin:0">${speciesText(species)}</p>
    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.09em;opacity:.5;margin:26px 0 8px">${t('traits')}</h2>
    <ul style="line-height:1.75;padding-left:20px;margin:0">${traitsHtml}</ul>
    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.09em;opacity:.5;margin:26px 0 8px">${t('ecology')}</h2>
    <ul style="line-height:1.75;padding-left:20px;margin:0">
      <li>${t('substrate')}: ${label(species.ecology.substrate)}</li>
      ${
        species.ecology.mycorrhizal.length
          ? `<li>${t('partners')}: ${species.ecology.mycorrhizal.join(', ')}</li>`
          : ''
      }
    </ul>
    ${
      species.lookalikes.length
        ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.09em;opacity:.5;margin:26px 0 8px">${t('lookalikes')}</h2>
           <div style="opacity:.9">${species.lookalikes.join(', ')}</div>`
        : ''
    }
    <div style="margin-top:32px;display:flex;gap:12px">
      <button id="collect" style="padding:11px 22px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-size:15px;font-weight:600;cursor:pointer">${t('collect')}</button>
      <button id="cut" style="padding:11px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:15px;cursor:pointer">${t('cut')}</button>
      <button id="leave" style="padding:11px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:15px;cursor:pointer">${t('leave')}</button>
    </div>`

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(view.clientWidth, view.clientHeight)
  view.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(1, 2, 1.5)
  scene.add(key)

  // The detailed group, not the merged world mesh: here the parts matter.
  const model = buildCollectible(species, seed, age)
  // Centre the model on the origin, or the orbit turns around the ground
  // beneath it and the underside can never be brought into view.
  const box = new THREE.Box3().setFromObject(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  scene.add(model)

  const size = box.getSize(new THREE.Vector3())
  const camera = new THREE.PerspectiveCamera(45, view.clientWidth / view.clientHeight, 0.005, 10)
  const detachOrbit = attachOrbit(
    camera,
    view,
    new THREE.Vector3(0, 0, 0),
    Math.max(size.x, size.y) * 2.4,
  )

  renderer.setAnimationLoop(() => renderer.render(scene, camera))

  const resize = () => {
    camera.aspect = view.clientWidth / view.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(view.clientWidth, view.clientHeight)
  }
  addEventListener('resize', resize)

  const close = () => {
    renderer.setAnimationLoop(null)
    detachOrbit()
    renderer.dispose()
    overlay.remove()
    removeEventListener('keydown', onKey)
    removeEventListener('resize', resize)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      close()
      onLeave()
    }
  }
  addEventListener('keydown', onKey)

  card.querySelector('#collect')!.addEventListener('click', () => {
    close()
    onCollect()
  })
  card.querySelector('#cut')!.addEventListener('click', () => {
    close()
    onCut()
  })
  card.querySelector('#leave')!.addEventListener('click', () => {
    close()
    onLeave()
  })
}
