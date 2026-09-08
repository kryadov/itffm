import * as THREE from 'three'
import { createForest, HALF_SIZE } from './game/scene'
import { loadForestData, type LoadStage } from './game/loadForest'
import { createControls } from './game/controls'
import { stepPlayer, eyeHeight, type PlayerState, type Obstacle } from './game/player'
import { createBasket, nearestInView } from './game/pick'
import { createHud } from './ui/hud'
import { createCompass } from './ui/compass'
import { openInspect } from './ui/inspect'
import { openEncyclopedia } from './ui/encyclopedia'
import { openPlacePicker, showLoading } from './ui/placePicker'
import { speciesById } from './species/load'
import { emptySave, loadSave, persistSave, applyFind, type SaveData } from './save/store'
import { setLang, getLang, t, speciesName } from './i18n/i18n'

declare global {
  // boot-check waits on __READY: it is set only if the module ran to the end.
  // __BOOTCHECK tells us we are inside that headless run: it skips the place
  // picker and the network entirely and goes straight to the offline demo
  // wood, so the check never depends on Overpass, Nominatim or tile servers
  // being reachable from wherever it runs.
  interface Window { __READY?: boolean; __BOOTCHECK?: boolean }
}

/** Beyond this a mushroom is a pixel; drawing it costs a call for nothing. */
const MUSHROOM_DRAW_DISTANCE = 45
/** How far you can reach to pick, metres. */
const REACH = 3
const BASKET_CAPACITY = 24

const STAGE_KEY: Record<LoadStage, 'stageGeocode' | 'stageOsm' | 'stageTerrain' | 'stageBuild'> = {
  geocode: 'stageGeocode',
  osm: 'stageOsm',
  terrain: 'stageTerrain',
  build: 'stageBuild',
}

async function main(): Promise<void> {
  const ui = document.getElementById('ui')!
  const app = document.getElementById('app')!
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  app.appendChild(renderer.domElement)

  // Not awaited: IndexedDB's callback never arrives under boot-check's virtual
  // clock, which hung the whole module the last time this was a blocking
  // await (see git history). A real user picks a place over several seconds
  // at the least, and the local round trip finishes well within that, so the
  // language is in place in practice before it is ever read for real; the
  // one cost is the place picker itself possibly rendering once in the
  // default language before a saved preference arrives, same trade-off the
  // first-run disclaimer already accepted.
  let save: SaveData = emptySave()
  void loadSave().then((loaded) => {
    save = loaded
    setLang(save.lang)
  })

  const query = window.__BOOTCHECK ? null : await new Promise<string | null>((resolve) => openPlacePicker(resolve))

  const loading = showLoading(t(STAGE_KEY.geocode))
  const { source, fellBackTo, seed } = await loadForestData(query, (stage) => {
    loading.update(t(STAGE_KEY[stage]))
  })
  loading.close()

  if (fellBackTo && query) toast(t('fellBackNotice'))

  const forest = createForest(source, seed)
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 300)
  const controls = createControls(renderer.domElement)
  const basket = createBasket(BASKET_CAPACITY)
  const hud = createHud(ui)
  hud.setBasket(0, BASKET_CAPACITY)
  const compass = createCompass(ui)

  const obstacles: Obstacle[] = forest.trees.map((tr) => ({ x: tr.x, z: tr.z, radius: tr.radius }))
  let player: PlayerState = { x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false }
  let aimed: THREE.Object3D | null = null

  function toast(text: string): void {
    const el = document.createElement('div')
    el.style.cssText =
      'position:fixed;left:50%;top:22px;transform:translateX(-50%);background:#2a1f14;' +
      'border-left:3px solid #d8a04a;padding:10px 16px;border-radius:0 6px 6px 0;font-size:14px;' +
      'max-width:520px;text-align:center;pointer-events:none'
    el.textContent = text
    ui.appendChild(el)
    setTimeout(() => el.remove(), 6000)
  }

  function modalOpen(): boolean {
    return ui.querySelector('[data-modal]') !== null
  }

  function cullDistantMushrooms(): void {
    const limit = MUSHROOM_DRAW_DISTANCE * MUSHROOM_DRAW_DISTANCE
    for (const m of forest.mushroomObjects) {
      const dx = m.position.x - player.x
      const dz = m.position.z - player.z
      m.visible = dx * dx + dz * dz < limit
    }
  }

  function updateAim(): void {
    if (modalOpen()) {
      aimed = null
      hud.setTarget(null)
      return
    }
    aimed = nearestInView(camera, forest.mushroomObjects, REACH)
    const species = aimed ? speciesById(aimed.userData.placement.speciesId) : undefined
    hud.setTarget(species ? speciesName(species) : null)
  }

  function examineAimed(): void {
    const target = aimed
    if (!target) return
    const placement = target.userData.placement
    const species = speciesById(placement.speciesId)
    if (!species) return

    openInspect(
      species,
      placement.seed,
      placement.age,
      () => {
        if (!basket.add(placement)) return
        target.removeFromParent()
        forest.mushroomObjects.splice(forest.mushroomObjects.indexOf(target), 1)
        hud.setBasket(basket.items.length, BASKET_CAPACITY)
        save = applyFind(save, {
          speciesId: placement.speciesId,
          x: placement.x,
          z: placement.z,
          at: Date.now(),
        })
        void persistSave(save)
      },
      () => {},
    )
    aimed = null
    hud.setTarget(null)
  }

  /** A plain overlay with a heading, some body html and a close key. */
  function overlay(id: string, html: string, closeKeys: string[]): HTMLElement {
    document.exitPointerLock()
    const el = document.createElement('div')
    el.id = id
    el.dataset.modal = 'true'
    el.style.cssText =
      'position:fixed;inset:0;background:rgba(15,19,14,.95);pointer-events:auto;display:flex;' +
      'align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee'
    el.innerHTML = html
    ui.appendChild(el)

    const close = (e: KeyboardEvent) => {
      if (!closeKeys.includes(e.code)) return
      e.preventDefault()
      el.remove()
      removeEventListener('keydown', close)
    }
    addEventListener('keydown', close)
    return el
  }

  function showDisclaimer(): void {
    const el = overlay(
      'disclaimer',
      `<div style="max-width:540px;padding:34px">
         <p style="line-height:1.6;margin:0 0 22px">${t('disclaimer')}</p>
         <p style="opacity:.6;font-size:14px;margin:0 0 26px">${t('controls')}</p>
         <button id="ok" style="padding:11px 24px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-weight:600;font-size:15px;cursor:pointer">${t('understood')}</button>
       </div>`,
      [],
    )
    el.querySelector('#ok')!.addEventListener('click', () => {
      el.remove()
      save = { ...save, disclaimerSeen: true }
      void persistSave(save)
    })
  }

  function showTally(): void {
    const counts = new Map<string, number>()
    for (const item of basket.items) counts.set(item.speciesId, (counts.get(item.speciesId) ?? 0) + 1)

    const rows = [...counts.entries()]
      .map(([id, n]) => {
        const s = speciesById(id)!
        return `<li style="line-height:1.85">${speciesName(s)} — ${n}
          <span style="opacity:.6">(${t(s.edibility)})</span></li>`
      })
      .join('')

    overlay(
      'tally',
      `<div style="max-width:460px;padding:34px">
         <h1 style="margin:0 0 18px;font-size:24px">${t('tally')}</h1>
         ${rows ? `<ul style="padding-left:20px;margin:0">${rows}</ul>` : `<p style="opacity:.8;margin:0">${t('tallyEmpty')}</p>`}
         <p style="opacity:.5;font-size:14px;margin-top:26px">${t('closeHint')}</p>
       </div>`,
      ['Escape', 'KeyQ', 'Tab'],
    )
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })

  addEventListener('keydown', (e) => {
    if (modalOpen()) return
    if (e.code === 'KeyE') examineAimed()
    if (e.code === 'Tab') {
      e.preventDefault()
      openEncyclopedia(save, getLang())
    }
    if (e.code === 'KeyQ') showTally()
  })

  if (!save.disclaimerSeen) showDisclaimer()

  let last = performance.now()
  let bootFrames = 0
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // While an overlay is up the player stands still: the mouse belongs to it.
    if (!modalOpen()) {
      player = stepPlayer(player, controls.read(dt), forest.ground, obstacles)
      player.x = Math.max(-HALF_SIZE, Math.min(HALF_SIZE, player.x))
      player.z = Math.max(-HALF_SIZE, Math.min(HALF_SIZE, player.z))
    }

    camera.position.set(
      player.x,
      forest.ground.heightAt(player.x, player.z) + eyeHeight(player) + player.hop,
      player.z,
    )
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    compass.update(player.yaw)

    cullDistantMushrooms()
    updateAim()
    renderer.render(forest.scene, camera)

    // Boot-check needs only a handful of frames, and can't afford more: a few
    // rather than exactly one gives the compositor a chance to actually
    // present what was drawn before the loop stops.
    if (window.__BOOTCHECK && ++bootFrames >= 3) renderer.setAnimationLoop(null)
  })

  window.__READY = true
}

void main().catch((e) => console.error('itffm: failed to start', e))
