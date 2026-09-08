import * as THREE from 'three'
import { createForest } from './game/scene'
import { DEFAULT_WORLD_SIZE } from './ui/worldSize'
import { loadForestData, type LoadStage } from './game/loadForest'
import { createControls } from './game/controls'
import { stepPlayer, eyeHeight, biomeSpeedFactor, type PlayerState, type Obstacle } from './game/player'
import { chooseStartPose } from './game/startPose'
import { createBasket, nearestInView } from './game/pick'
import { createHud } from './ui/hud'
import { createCompass } from './ui/compass'
import { openInspect } from './ui/inspect'
import { openEncyclopedia } from './ui/encyclopedia'
import { openPlacePicker, showLoading } from './ui/placePicker'
import { renderCollectiblePreview } from './ui/preview'
import { openSettingsMenu } from './ui/settingsMenu'
import { timeFor, DAY_TIME } from './world/daynight'
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

/** How far you can reach to pick, metres. */
const REACH = 3
const BASKET_CAPACITY = 24
/** Real seconds for one full day/night loop in 'cycle' mode. */
const DAY_LENGTH_SECONDS = 600

const STAGE_KEY: Record<LoadStage, 'stageGeocode' | 'stageOsm' | 'stageTerrain' | 'stageBuild'> = {
  geocode: 'stageGeocode',
  osm: 'stageOsm',
  terrain: 'stageTerrain',
  build: 'stageBuild',
}
const STAGE_ORDER: LoadStage[] = ['geocode', 'osm', 'terrain', 'build']
const stageFraction = (stage: LoadStage): number => (STAGE_ORDER.indexOf(stage) + 1) / STAGE_ORDER.length

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

  const [query, halfSize] = window.__BOOTCHECK
    ? [null, DEFAULT_WORLD_SIZE.halfSize]
    : await new Promise<[string | null, number]>((resolve) =>
        openPlacePicker((q, hs) => resolve([q, hs])),
      )

  const loading = showLoading(t(STAGE_KEY.geocode), stageFraction('geocode'))
  const { source, fellBackTo, seed } = await loadForestData(
    query,
    (stage) => {
      loading.update(t(STAGE_KEY[stage]), stageFraction(stage))
    },
    halfSize,
  )
  loading.close()

  if (fellBackTo && query) toast(t('fellBackNotice'))

  const forest = createForest(source, seed, halfSize)
  forest.setWeather(save.prefs.weather)
  // Far enough that the sky dome (radius 1500, see world/sky.ts) is not
  // clipped away — the fog (scene.ts) still hides the forest floor at 140m
  // regardless, so this only decides whether the sky above it is visible.
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 2000)
  // Whatever `save` holds right now — likely the real loaded save by this
  // point, same trade-off `setLang` above already accepts: a real user's
  // place-picker interaction takes far longer than the IndexedDB round trip.
  const controls = createControls(renderer.domElement, save.prefs.mouseSensitivity)
  const basket = createBasket(BASKET_CAPACITY)
  const hud = createHud(ui, () => {
    if (!modalOpen()) openSettings()
  })
  hud.setBasket(0, BASKET_CAPACITY)
  const compass = createCompass(ui)

  const obstacles: Obstacle[] = [
    ...forest.trees.map((tr) => ({ x: tr.x, z: tr.z, radius: tr.radius })),
    ...forest.extraObstacles,
  ]
  const startPose = chooseStartPose(obstacles, halfSize, forest.shelter)
  let player: PlayerState = {
    x: startPose.x, z: startPose.z, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false,
  }
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
    const limit = save.prefs.drawDistance * save.prefs.drawDistance
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
    aimed = nearestInView(camera, forest.mushroomObjects, REACH, forest.occluders)
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
      () => {
        // Cut but not carried: it stays a mushroom, just a felled one — off
        // the aim list (game/pick.ts) so it can't be re-examined, but still a
        // real mesh lying where it grew, not vanished like a picked one.
        forest.mushroomObjects.splice(forest.mushroomObjects.indexOf(target), 1)
        const fallAxis = new THREE.Vector3(Math.cos(placement.rotationY), 0, Math.sin(placement.rotationY))
        target.rotateOnWorldAxis(fallAxis, Math.PI / 2)
        const box = new THREE.Box3().setFromObject(target)
        target.position.y += forest.ground.heightAt(placement.x, placement.z) - box.min.y
      },
    )
    aimed = null
    hud.setTarget(null)
  }

  function openSettings(): void {
    openSettingsMenu(save.prefs, {
      onLangChange: (lang) => {
        save = { ...save, lang }
        void persistSave(save)
      },
      onPrefsChange: (prefs) => {
        save = { ...save, prefs }
        controls.setSensitivity(prefs.mouseSensitivity)
        forest.setWeather(prefs.weather)
        void persistSave(save)
      },
    })
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

  // Each specimen rendered as itself — its own seed and age, not a grouped
  // count — because the point of a 3D basket is seeing the actual mushrooms
  // (or berries, or whatever else the basket holds) laid out side by side,
  // most useful for a species the player doesn't already know by name.
  function showTally(): void {
    const cards = basket.items
      .map((item) => {
        const s = speciesById(item.speciesId)!
        const preview = renderCollectiblePreview(s, item.seed, item.age, 120, false)
        const edibility = s.kind !== 'find' ? ` <span style="opacity:.6">(${t(s.edibility)})</span>` : ''
        return `<div style="background:#171d15;border-radius:10px;padding:10px;text-align:center">
          <img src="${preview}" width="120" height="120" alt="" style="display:block;margin:0 auto 6px" />
          <div style="font-size:13px">${speciesName(s)}${edibility}</div>
        </div>`
      })
      .join('')

    overlay(
      'tally',
      `<div style="max-width:640px;max-height:80vh;overflow:auto;padding:34px">
         <h1 style="margin:0 0 18px;font-size:24px">${t('tally')} — ${basket.items.length}</h1>
         ${
           cards
             ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px">${cards}</div>`
             : `<p style="opacity:.8;margin:0">${t('tallyEmpty')}</p>`
         }
         <p style="opacity:.5;font-size:14px;margin-top:26px">${t('closeHint')}</p>
       </div>`,
      ['Escape', 'KeyQ', 'Tab'],
    )
  }

  function openExitConfirm(): void {
    const el = overlay(
      'exitConfirm',
      `<div style="max-width:380px;padding:30px;text-align:center">
         <p style="margin:0 0 22px;line-height:1.5">${t('exitConfirm')}</p>
         <div style="display:flex;gap:12px;justify-content:center">
           <button id="exit-yes" style="padding:10px 22px;border:0;border-radius:8px;background:#c4514f;color:#fff;font-weight:600;cursor:pointer">${t('exitYes')}</button>
           <button id="exit-no" style="padding:10px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;cursor:pointer">${t('exitNo')}</button>
         </div>
       </div>`,
      ['Escape'],
    )
    el.querySelector('#exit-yes')!.addEventListener('click', () => location.reload())
    el.querySelector('#exit-no')!.addEventListener('click', () => el.remove())
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
    if (e.code === 'KeyM') openSettings()
    if (e.code === 'Escape') openExitConfirm()
    if (e.code === 'KeyF') {
      flashlightOn = !flashlightOn
      forest.setFlashlight(flashlightOn)
    }
  })

  if (!save.disclaimerSeen) showDisclaimer()

  let last = performance.now()
  let bootFrames = 0
  // Only read in 'cycle' mode — 'day' and 'night' hold their own fixed time
  // (see world/daynight.ts's timeFor), starting at noon so a first frame
  // rendered before this ever advances still matches the old fixed look.
  let cycleT = DAY_TIME
  // Off at the start of every walk — a session preference, not a saved one:
  // there is no reason a flashlight left on should surprise the next visit.
  let flashlightOn = false
  const camDir = new THREE.Vector3()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // While an overlay is up the player stands still: the mouse belongs to it.
    if (!modalOpen()) {
      const speed = save.prefs.walkSpeedMultiplier * biomeSpeedFactor(source.biomeAt(player.x, player.z))
      player = stepPlayer(player, controls.read(dt), forest.ground, obstacles, speed)
      player.x = Math.max(-halfSize, Math.min(halfSize, player.x))
      player.z = Math.max(-halfSize, Math.min(halfSize, player.z))
    }

    camera.position.set(
      player.x,
      forest.ground.heightAt(player.x, player.z) + eyeHeight(player) + player.hop,
      player.z,
    )
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    compass.update(player.yaw)
    if (save.prefs.timeMode === 'cycle') cycleT = (cycleT + dt / DAY_LENGTH_SECONDS) % 1
    forest.updateDayNight(timeFor(save.prefs.timeMode, cycleT), camera.position)
    forest.updateClouds(camera.position, dt)
    forest.updateWeather(camera.position, dt)
    if (flashlightOn) forest.updateFlashlight(camera.position, camera.getWorldDirection(camDir))

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
