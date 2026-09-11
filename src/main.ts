import * as THREE from 'three'
import { createForest } from './game/scene'
import { createWorldStream } from './game/worldStream'
import { DEFAULT_WORLD_SIZE } from './ui/worldSize'
import { loadForestData, type LoadStage } from './game/loadForest'
import { createControls } from './game/controls'
import { createTouchControls } from './game/touchControls'
import { AudioEngine } from './audio/audio'
import { crossedFootstep, footstepSubstrate } from './audio/footsteps'
import { birdPan, birdGain, nearestBird } from './audio/birdCalls'
import { distanceToRing } from './util/geometry'
import { mulberry32 } from './util/rng'
import { stepPlayer, eyeHeight, cameraBob, biomeSpeedFactor, type PlayerState, type Obstacle } from './game/player'
import { chooseStartPose } from './game/startPose'
import { createBasket, nearestInView, debugRaycastHits } from './game/pick'
import type { Placement } from './ecology/spawn'
import { createHud } from './ui/hud'
import { createCompass } from './ui/compass'
import { createMinimap, headingFromYaw } from './ui/minimap'
import { openInspect } from './ui/inspect'
import { openEncyclopedia } from './ui/encyclopedia'
import { openPlacePicker, showLoading } from './ui/placePicker'
import { renderCollectiblePreview } from './ui/preview'
import { openSettingsMenu } from './ui/settingsMenu'
import { timeFor, DAY_TIME } from './world/daynight'
import { speciesById } from './species/load'
import { HITBOX_RADIUS } from './collectible/build'
import { DOOR_INTERACT_RADIUS } from './world/shelter'
import { emptySave, loadSave, persistSave, applyFind, setFindNote, type SaveData } from './save/store'
import { setLang, getLang, t, speciesName } from './i18n/i18n'

declare global {
  // boot-check waits on __READY: it is set only if the module ran to the end.
  // __BOOTCHECK tells us we are inside that headless run: it skips the place
  // picker and the network entirely and goes straight to the offline demo
  // wood, so the check never depends on Overpass, Nominatim or tile servers
  // being reachable from wherever it runs.
  interface Window { __READY?: boolean; __BOOTCHECK?: boolean }
}

// PWA: an icon on the home screen and a wood that still opens with no signal
// once it has been visited once. Registered outside main() and unguarded by
// __BOOTCHECK — this is independent of the game ever loading, and a failed
// registration (an older browser, a disabled service worker) is silently
// fine either way, the same as any other progressive enhancement.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}

/** How far you can reach to pick, metres. */
const REACH = 3
const BASKET_CAPACITY = 24
/** How close to a pond/stream ring a footstep reads as "water" underfoot —
 *  close enough to be at its edge, not merely somewhere in view of it. */
const WATER_FOOTSTEP_RADIUS = 1.5
/** How far a bird call still carries, metres — past this the flock is
 *  simply out of earshot (`audio/birdCalls.ts`'s `birdGain`/`nearestBird`). */
const BIRD_CALL_RADIUS = 60
/** How long, in real seconds, between one bird call and the next roll for
 *  another — wide enough that the wood isn't a chorus every second, narrow
 *  enough that a flock nearby is heard now and then, not never. */
const BIRD_CALL_MIN_GAP = 4
const BIRD_CALL_MAX_GAP = 11
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
  // Off everywhere except the shelter's own hearth light and walls
  // (world/shelter.ts) — the only pair in the wood that opted in with
  // castShadow/receiveShadow. Fifteen hundred trees casting real shadows is
  // its own future project (see TODO.md); one light in one hut is cheap.
  renderer.shadowMap.enabled = true
  app.appendChild(renderer.domElement)

  // Not awaited: IndexedDB's callback never arrives under boot-check's virtual
  // clock, which hung the whole module the last time this was a blocking
  // await (see git history). A real user picks a place over several seconds
  // at the least, and the local round trip finishes well within that, so the
  // language is in place in practice before it is ever read for real; the
  // one cost is the place picker itself possibly rendering once in the
  // default language before a saved preference arrives.
  let save: SaveData = emptySave()
  void loadSave().then((loaded) => {
    save = loaded
    setLang(save.lang)
  })

  const [query, pickedHalfSize] = window.__BOOTCHECK
    ? [null, DEFAULT_WORLD_SIZE.halfSize]
    : await new Promise<[string | null, number]>((resolve) =>
        openPlacePicker((q, hs) => resolve([q, hs])),
      )

  // The click that just picked a place is the only user gesture Pointer Lock
  // ever gets to work with here — `game/controls.ts`'s own click handler on
  // the canvas would ask again, but only once the player clicks a SECOND
  // time, since this first click landed on the place-picker's own button, not
  // on the canvas. Asking again right here, still inside that gesture's
  // transient-activation window (a `resolve()`d promise's continuation runs
  // as a microtask, not after a real delay), means mouse-look already works
  // the moment the wood appears. `loadForestData` below can take several
  // real seconds — long enough to burn through that window — so this cannot
  // wait until after it.
  if (!window.matchMedia?.('(pointer: coarse)').matches) {
    renderer.domElement.requestPointerLock().catch(() => {})
  }

  const loading = showLoading(t(STAGE_KEY.geocode), stageFraction('geocode'))
  const { source, fellBackTo, seed, halfSize, groundSegments } = await loadForestData(
    query,
    (stage) => {
      loading.update(t(STAGE_KEY[stage]), stageFraction(stage))
    },
    pickedHalfSize,
  )
  loading.close()

  if (fellBackTo && query) toast(t('fellBackNotice'))

  // The demo wood always builds its own home plot at CHUNK_SIZE/2 (see
  // game/loadForest.ts and docs/superpowers/specs/2026-09-10-infinite-world-
  // design.md), regardless of what the world-size picker asked for — this
  // `halfSize` is what was actually built, not necessarily `pickedHalfSize`,
  // or the home plot and its streamed surroundings below would disagree
  // about where the reserved chunk (0, 0) actually ends.
  const forest = createForest(source, seed, halfSize, groundSegments)
  forest.setWeather(save.prefs.weather)
  // Infinite wilderness beyond the home plot — the demo wood only
  // (fellBackTo === 'demo' covers both a deliberate "just show the forest"
  // press and a real query that failed and fell back to it; either way it
  // is the same wood built the same way, see loadForestData). A named real
  // place keeps its old, bounded behaviour untouched.
  const worldStream = fellBackTo === 'demo' ? createWorldStream(forest.scene, seed, forest.ground, halfSize) : null
  const combinedGround = worldStream ? { heightAt: worldStream.heightAt } : forest.ground
  const mushroomCandidates = (): THREE.Object3D[] =>
    worldStream ? [...forest.mushroomObjects, ...worldStream.mushroomObjects()] : forest.mushroomObjects
  function removeMushroomTarget(target: THREE.Object3D): void {
    const i = forest.mushroomObjects.indexOf(target)
    if (i >= 0) forest.mushroomObjects.splice(i, 1)
    else worldStream?.removeMushroomObject(target)
  }
  // Far enough that the sky dome (radius 1500, see world/sky.ts) is not
  // clipped away — the fog (scene.ts) still hides the forest floor at 140m
  // regardless, so this only decides whether the sky above it is visible.
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 2000)
  // Whatever `save` holds right now — likely the real loaded save by this
  // point, same trade-off `setLang` above already accepts: a real user's
  // place-picker interaction takes far longer than the IndexedDB round trip.
  const controls = createControls(renderer.domElement, save.prefs.mouseSensitivity)
  // Built unconditionally — it is a no-op on anything without a coarse
  // pointer — and simply preferred over mouse/keyboard whenever it is
  // `active`, rather than merging both: a hybrid device summing both inputs
  // is a far rarer problem than the code to handle it is worth right now.
  const touch = createTouchControls(renderer.domElement, save.prefs.mouseSensitivity)
  controls.setInvertY(save.prefs.invertMouseY)
  touch.setInvertY(save.prefs.invertMouseY)
  // resume() needs a user gesture (autoplay policy) — the place-picker click
  // just above is the earliest one every player, new or returning, always
  // makes before gameplay starts.
  const audio = new AudioEngine()
  audio.resume()
  audio.setVolume(save.prefs.soundVolume)
  const basket = createBasket(BASKET_CAPACITY)
  // Which save/store.ts Find a basket item's note belongs to — a Placement
  // carries no identity of its own, but it is the very object the collect
  // handler already has in hand at the moment it creates that Find.
  const findAtByPlacement = new WeakMap<Placement, number>()
  const hud = createHud(
    ui,
    () => {
      // The gear is the touch equivalent of a first `Escape`: touch has no
      // physical key for it, so this is the only way a touch player ever
      // reaches "change location" — reusing the same pause menu Esc opens,
      // rather than jumping straight to settings, keeps the two routes equal.
      if (!modalOpen()) openPauseMenu()
    },
    {
      active: touch.active,
      onEncyclopedia: () => {
        if (!modalOpen()) openEncyclopedia(save, getLang())
      },
      onTally: () => {
        if (!modalOpen()) showTally()
      },
    },
  )
  hud.setBasket(0, BASKET_CAPACITY)
  const compass = createCompass(ui)
  const minimap = createMinimap(ui)
  minimap.setWorld(source.paths ?? [], source.water ?? [], forest.shelter, halfSize)
  minimap.setVisible(save.prefs.minimap)

  const obstacles: Obstacle[] = [
    ...forest.trees.map((tr) => ({ x: tr.x, z: tr.z, radius: tr.radius })),
    ...forest.extraObstacles,
  ]
  const startPose = chooseStartPose(obstacles, halfSize, forest.shelter)
  let player: PlayerState = {
    x: startPose.x, z: startPose.z, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0,
    bobPhase: 0,
  }
  // Bird calls: a random wait, then whichever bird happens to be nearest
  // when it elapses — same "roll a duration, count it down" shape as
  // `world/birds.ts`'s own perch timers, just for the audio side instead.
  const birdCallRand = mulberry32(seed + 40)
  let birdCallTimer = BIRD_CALL_MIN_GAP + birdCallRand() * (BIRD_CALL_MAX_GAP - BIRD_CALL_MIN_GAP)

  let aimed: THREE.Object3D | null = null
  // Whether the player is close enough to the shelter's own doorway for `E`
  // to open/close it instead of examining an aimed mushroom — a plain
  // distance check (game/pick.ts's crosshair raycast is for a mushroom you
  // aim at; a doorway is a fixed, room-sized target you just walk up to).
  let nearDoor = false

  // A live readout of what the crosshair actually sees, for exactly the kind
  // of "the label just doesn't show up" report that is otherwise
  // unreproducible from the outside: every value nearestInView (game/pick.ts)
  // itself would need — camera position and facing, the exact ray's own hit
  // list in order, and the nearest small candidates by distance and angle —
  // so a live session can be diagnosed from one screenshot instead of a
  // guessed-at repro script. Starts on with `?debug=1` (handy for a repro
  // link) but stays reachable afterwards with F3, the same key every
  // Minecraft-descended game already uses for this.
  let debugEnabled = new URLSearchParams(location.search).has('debug')
  let debugEl: HTMLDivElement | null = null
  function ensureDebugEl(): HTMLDivElement {
    if (!debugEl) {
      debugEl = document.createElement('div')
      debugEl.style.cssText =
        'position:fixed;top:8px;right:8px;background:rgba(0,0,0,.82);color:#7fffb0;' +
        'font:12px/1.5 monospace;padding:8px 10px;white-space:pre;pointer-events:none;z-index:9999;max-width:520px'
      ui.appendChild(debugEl)
    }
    return debugEl
  }
  if (debugEnabled) ensureDebugEl()
  const debugCamDir = new THREE.Vector3()
  const debugCamRight = new THREE.Vector3()
  const debugCamUp = new THREE.Vector3()
  const debugWorldUp = new THREE.Vector3(0, 1, 0)
  function updateDebugOverlay(): void {
    if (!debugEnabled) return
    const debugEl = ensureDebugEl()
    camera.getWorldDirection(debugCamDir)
    // "Off-axis angle" turned out to be the wrong number to show: something
    // can sit well inside the 70° FOV (so visibly on screen) while still
    // being a metre or more sideways of the actual aim ray at any real
    // distance — "in view" and "aimed at" are not the same thing, and an
    // angle alone made that read as a mystery instead of "you're just not
    // looking straight at it yet" (2026-09-09 live report). What actually
    // predicts a hit is the ray's own perpendicular (lateral) miss distance
    // against withPickHitbox's own radius — the exact same number
    // game/pick.ts's raycaster would test.
    debugCamRight.crossVectors(debugCamDir, debugWorldUp).normalize()
    debugCamUp.crossVectors(debugCamRight, debugCamDir).normalize()
    const candidates: { id: string; dist: number; lateral: number; hint: string }[] = []
    for (const obj of forest.mushroomObjects) {
      const placement = obj.userData.placement
      const species = placement && speciesById(placement.speciesId)
      if (!species || species.kind === 'mushroom') continue
      const dx = obj.position.x - camera.position.x
      const dy = obj.position.y - camera.position.y
      const dz = obj.position.z - camera.position.z
      const dist = Math.hypot(dx, dy, dz) || 1e-6
      // Project onto the aim ray to find the closest approach, then measure
      // how far off that same ray the object actually sits.
      const t = dx * debugCamDir.x + dy * debugCamDir.y + dz * debugCamDir.z
      const lateral = Math.hypot(dx - t * debugCamDir.x, dy - t * debugCamDir.y, dz - t * debugCamDir.z)
      const horiz = (dx * debugCamRight.x + dy * debugCamRight.y + dz * debugCamRight.z) / dist
      const vert = (dx * debugCamUp.x + dy * debugCamUp.y + dz * debugCamUp.z) / dist
      const hint =
        t < 0
          ? 'BEHIND YOU'
          : lateral < HITBOX_RADIUS
            ? 'WOULD HIT'
            : `turn ${horiz > 0 ? 'RIGHT' : 'LEFT'}${Math.abs(vert) > 0.15 ? ` + ${vert > 0 ? 'UP' : 'DOWN'}` : ''} (off by ${lateral.toFixed(2)}m, hitbox is ${HITBOX_RADIUS}m)`
      candidates.push({ id: `${species.id} (${obj.position.x.toFixed(2)},${obj.position.y.toFixed(2)},${obj.position.z.toFixed(2)})`, dist, lateral, hint })
    }
    candidates.sort((a, b) => a.dist - b.dist)

    const hits = debugRaycastHits(camera, forest.mushroomObjects, REACH, forest.occluders)

    debugEl.textContent = [
      `aimed: ${aimed ? aimed.userData.placement.speciesId : 'none'}`,
      `player pos: ${player.x.toFixed(2)}, ${player.z.toFixed(2)} (ground y: ${forest.ground.heightAt(player.x, player.z).toFixed(2)})`,
      `camera pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`,
      `camera dir: ${debugCamDir.x.toFixed(3)}, ${debugCamDir.y.toFixed(3)}, ${debugCamDir.z.toFixed(3)}`,
      // player.yaw accumulates without wrapping (harmless — every use of it
      // goes through sin/cos, which do not care), so it is shown normalised
      // to ±180° here purely so the number itself is not alarming.
      `yaw/pitch: ${(((((player.yaw * 180) / Math.PI) % 360) + 540) % 360 - 180).toFixed(1)}° / ${((player.pitch * 180) / Math.PI).toFixed(1)}°`,
      `REACH: ${REACH}m`,
      `exact-ray hits (${hits.length}): ` +
        (hits.length ? hits.map((h) => `${h.name}@${h.distance.toFixed(2)}m${h.hasPlacement ? '[placement]' : ''}`).join(', ') : 'none'),
      `nearest small (top 3 of ${candidates.length} total, any distance):`,
      ...candidates.slice(0, 3).map((c) => `  ${c.id} — ${c.dist.toFixed(2)}m — ${c.hint}`),
    ].join('\n')
  }

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

  // Every overlay (inspect, encyclopedia, settings, the tally...) closes
  // itself and calls document.exitPointerLock() on the way in, but none of
  // them know about the canvas to re-lock it on the way out — leaving mouse
  // look dead until the player clicks the canvas by hand. Watching for the
  // last overlay leaving the DOM re-requests the lock right there, still
  // inside the closing keypress or click's own user gesture.
  new MutationObserver(() => {
    if (!modalOpen() && document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock()
    }
  }).observe(ui, { childList: true })

  function cullDistantMushrooms(): void {
    const limit = save.prefs.drawDistance * save.prefs.drawDistance
    for (const m of mushroomCandidates()) {
      const dx = m.position.x - player.x
      const dz = m.position.z - player.z
      m.visible = dx * dx + dz * dz < limit
    }
  }

  function updateAim(): void {
    if (modalOpen()) {
      aimed = null
      nearDoor = false
      hud.setTarget(null)
      return
    }
    aimed = nearestInView(camera, mushroomCandidates(), REACH, forest.occluders)
    const species = aimed ? speciesById(aimed.userData.placement.speciesId) : undefined
    if (species) {
      nearDoor = false
      hud.setTarget(speciesName(species))
      return
    }
    // No mushroom in the crosshair — a mushroom never spawns inside the hut,
    // so this and an aimed mushroom are not really in tension in practice.
    nearDoor = Math.hypot(player.x - forest.shelterDoor.x, player.z - forest.shelterDoor.z) < DOOR_INTERACT_RADIUS
    hud.setTarget(nearDoor ? t('shelterDoor') : null)
  }

  const traceGeo = new THREE.CircleGeometry(0.07, 8)
  const traceMat = new THREE.MeshStandardMaterial({ color: 0x2e2418, roughness: 1 })

  /**
   * A collected specimen (unlike a cut one) leaves nothing behind by itself —
   * removing the object is the whole game-state change. This adds the honest
   * "something grew here" mark a real forager's disturbed leaf litter would
   * leave, so retracing a walk shows its own history instead of looking
   * untouched.
   */
  function leaveTrace(placement: { x: number; z: number; rotationY: number }): void {
    const mark = new THREE.Mesh(traceGeo, traceMat)
    mark.rotation.x = -Math.PI / 2
    mark.rotation.z = placement.rotationY
    mark.position.set(placement.x, combinedGround.heightAt(placement.x, placement.z) + 0.003, placement.z)
    forest.scene.add(mark)
  }

  /**
   * Opens the inspect card for a target the player is reaching for — the
   * crosshair's own aim on desktop (`examineAimed`), or whatever a touch tap
   * landed on directly (see the animation loop below): the same flow either
   * way, since a tap already stands for "aim at it and press E" in one motion.
   */
  function examineTarget(target: THREE.Object3D | null): void {
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
        audio.collect()
        target.removeFromParent()
        removeMushroomTarget(target)
        leaveTrace(placement)
        hud.setBasket(basket.items.length, BASKET_CAPACITY)
        const at = Date.now()
        findAtByPlacement.set(placement, at)
        save = applyFind(save, { speciesId: placement.speciesId, x: placement.x, z: placement.z, at })
        void persistSave(save)
      },
      () => {},
      () => {
        // Cut but not carried: it stays a mushroom, just a felled one — off
        // the aim list (game/pick.ts) so it can't be re-examined, but still a
        // real mesh lying where it grew, not vanished like a picked one.
        audio.collect()
        removeMushroomTarget(target)
        const fallAxis = new THREE.Vector3(Math.cos(placement.rotationY), 0, Math.sin(placement.rotationY))
        target.rotateOnWorldAxis(fallAxis, Math.PI / 2)
        const box = new THREE.Box3().setFromObject(target)
        target.position.y += combinedGround.heightAt(placement.x, placement.z) - box.min.y
      },
    )
    aimed = null
    hud.setTarget(null)
  }

  const examineAimed = (): void => examineTarget(aimed)

  function openSettings(): void {
    openSettingsMenu(save.prefs, {
      onLangChange: (lang) => {
        save = { ...save, lang }
        void persistSave(save)
      },
      onPrefsChange: (prefs) => {
        save = { ...save, prefs }
        controls.setSensitivity(prefs.mouseSensitivity)
        touch.setSensitivity(prefs.mouseSensitivity)
        controls.setInvertY(prefs.invertMouseY)
        touch.setInvertY(prefs.invertMouseY)
        audio.setVolume(prefs.soundVolume)
        forest.setWeather(prefs.weather)
        minimap.setVisible(prefs.minimap)
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
    // `overflow-y:auto` on THIS element, not on the one that also centers —
    // a mobile browser's own chrome (address bar) eats real screen space
    // that `position:fixed;inset:0` doesn't know about, so a `100vh`-sized
    // box can be taller than what's actually visible; centering AND
    // scrolling the same element clips the unreachable part instead of
    // letting it scroll into view (a known flexbox+overflow quirk). The
    // inner wrapper does the centering; this element only ever scrolls.
    el.style.cssText =
      'position:fixed;inset:0;overflow-y:auto;background:rgba(15,19,14,.95);pointer-events:auto;' +
      'font-family:system-ui,sans-serif;color:#eee'
    el.innerHTML =
      `<div style="min-height:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center">` +
      `${html}</div>`
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

  // The always-visible corner hint (ui/hud.ts) tells a player the H key
  // exists at all; this is what it opens — the same control list a first-run
  // disclaimer screen used to show once, before that screen was removed
  // entirely (2026-09-11: it kept blocking mobile play past repair).
  function showHelp(): void {
    overlay(
      'help',
      `<div style="max-width:480px;padding:34px">
         <h1 style="margin:0 0 18px;font-size:22px">${t('helpTitle')}</h1>
         <p style="line-height:1.7;margin:0">${t('controls')}</p>
         <p style="opacity:.5;font-size:14px;margin-top:26px">${t('helpClose')}</p>
       </div>`,
      ['Escape', 'KeyH'],
    )
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
        const at = findAtByPlacement.get(item)
        const note = at !== undefined ? (save.finds.find((f) => f.at === at)?.note ?? '') : ''
        const noteBox =
          at !== undefined
            ? `<textarea data-note-at="${at}" placeholder="${t('notePlaceholder')}" rows="2"
                 style="width:100%;margin-top:6px;padding:5px;box-sizing:border-box;background:#0e120c;
                 color:#ddd;border:1px solid #384030;border-radius:6px;font:inherit;font-size:12px;resize:none"
               >${note}</textarea>`
            : ''
        return `<div style="background:#171d15;border-radius:10px;padding:10px;text-align:center">
          <img src="${preview}" width="120" height="120" alt="" style="display:block;margin:0 auto 6px" />
          <div style="font-size:13px">${speciesName(s)}${edibility}</div>
          ${noteBox}
        </div>`
      })
      .join('')

    const el = overlay(
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
    el.querySelectorAll<HTMLTextAreaElement>('textarea[data-note-at]').forEach((box) => {
      const at = Number(box.dataset.noteAt)
      // Typing a literal "q" or hitting Tab to leave the field must not also
      // trigger this same overlay's own close-key handler on `window`.
      box.addEventListener('keydown', (e) => {
        if (e.code !== 'Escape') e.stopPropagation()
      })
      box.addEventListener('blur', () => {
        save = setFindNote(save, at, box.value)
        void persistSave(save)
      })
    })
  }

  function openExitConfirm(): void {
    // Guards against a duplicate on top of itself — openPauseMenu()'s own
    // Escape handler below calls this on every second Escape press without
    // tracking whether one is already open (it stays attached across a
    // cancelled exit, see that function's own comment).
    if (document.getElementById('exitConfirm')) return
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

  const PAUSE_BTN_STYLE =
    'padding:11px 18px;border:1px solid #444;border-radius:8px;background:#1f261c;color:#eee;' +
    'font-size:15px;cursor:pointer;width:100%'

  /**
   * The first `Escape` (or the HUD gear, see createHud above): a start/pause
   * menu, not straight into the exit confirmation the way `Escape` used to
   * work — settings, changing location and the encyclopedia/basket views all
   * happen through the very functions their own hotkeys already call, so
   * this only wires up buttons for them, never a second implementation.
   */
  function openPauseMenu(): void {
    if (document.getElementById('pauseMenu')) return
    const el = overlay(
      'pauseMenu',
      `<div style="width:260px;padding:30px 34px;display:flex;flex-direction:column;gap:10px">
         <h1 style="margin:0 0 10px;font-size:22px;text-align:center">${t('pauseTitle')}</h1>
         <button id="pause-continue" style="${PAUSE_BTN_STYLE}">${t('pauseContinue')}</button>
         <button id="pause-settings" style="${PAUSE_BTN_STYLE}">${t('settingsTitle')}</button>
         <button id="pause-change-location" style="${PAUSE_BTN_STYLE}">${t('pauseChangeLocation')}</button>
         <button id="pause-encyclopedia" style="${PAUSE_BTN_STYLE}">${t('encyclopedia')}</button>
         <button id="pause-tally" style="${PAUSE_BTN_STYLE}">${t('tally')}</button>
       </div>`,
      [],
    )

    // A second Escape, with the menu still open, is "exit" — openExitConfirm()
    // unchanged, just reached from here instead of directly. Left attached
    // rather than one-shot, so cancelling the exit ("Stay") leaves a menu
    // that still responds to a further Escape; openExitConfirm's own guard
    // above is what keeps that from ever stacking two confirm dialogs.
    const onEscape = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      openExitConfirm()
    }
    addEventListener('keydown', onEscape)

    const closeMenu = (): void => {
      el.remove()
      removeEventListener('keydown', onEscape)
    }
    el.querySelector('#pause-continue')!.addEventListener('click', closeMenu)
    el.querySelector('#pause-settings')!.addEventListener('click', () => {
      closeMenu()
      openSettings()
    })
    // "Change location" is exactly what the exit confirm's own "Leave" button
    // already does — a full reload back to openPlacePicker() (`ui/placePicker.ts`)
    // — just without asking first, since choosing it from the menu is already
    // the deliberate action a second Escape's confirmation exists to catch.
    el.querySelector('#pause-change-location')!.addEventListener('click', () => location.reload())
    el.querySelector('#pause-encyclopedia')!.addEventListener('click', () => {
      closeMenu()
      openEncyclopedia(save, getLang())
    })
    el.querySelector('#pause-tally')!.addEventListener('click', () => {
      closeMenu()
      showTally()
    })
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })

  addEventListener('keydown', (e) => {
    if (modalOpen()) return
    if (e.code === 'KeyE') {
      if (nearDoor) forest.toggleShelterDoor()
      else examineAimed()
    }
    if (e.code === 'Tab') {
      e.preventDefault()
      openEncyclopedia(save, getLang())
    }
    if (e.code === 'KeyQ') showTally()
    if (e.code === 'KeyM') openSettings()
    if (e.code === 'KeyH') showHelp()
    if (e.code === 'Escape') openPauseMenu()
    if (e.code === 'KeyF') {
      flashlightOn = !flashlightOn
      forest.setFlashlight(flashlightOn)
    }
    if (e.code === 'F3') {
      debugEnabled = !debugEnabled
      ensureDebugEl().hidden = !debugEnabled
    }
  })

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

    // While an overlay is up the player stands still: the mouse/thumb belongs to it.
    if (!modalOpen()) {
      const inHome = Math.abs(player.x) <= halfSize && Math.abs(player.z) <= halfSize
      const biome = inHome ? source.biomeAt(player.x, player.z) : 'forest-mixed'
      const speed = save.prefs.walkSpeedMultiplier * biomeSpeedFactor(biome)
      const input = touch.active ? touch.read(dt) : controls.read(dt)
      const stepObstacles = worldStream ? [...obstacles, ...worldStream.obstacles()] : obstacles
      const prevBobPhase = player.bobPhase
      player = stepPlayer(player, input, combinedGround, stepObstacles, speed)
      if (!worldStream) {
        player.x = Math.max(-halfSize, Math.min(halfSize, player.x))
        player.z = Math.max(-halfSize, Math.min(halfSize, player.z))
      }
      worldStream?.update(player.x, player.z)

      if (crossedFootstep(prevBobPhase, player.bobPhase)) {
        const nearWater = (source.water ?? []).some(
          (ring) => distanceToRing(player.x, player.z, ring) < WATER_FOOTSTEP_RADIUS,
        )
        audio.footstep(footstepSubstrate(biome, nearWater))
      }

      birdCallTimer -= dt
      if (birdCallTimer <= 0) {
        birdCallTimer = BIRD_CALL_MIN_GAP + birdCallRand() * (BIRD_CALL_MAX_GAP - BIRD_CALL_MIN_GAP)
        const caller = nearestBird(forest.birdPositions(), player.x, player.z, BIRD_CALL_RADIUS)
        if (caller) {
          const dist = Math.hypot(caller.x - player.x, caller.z - player.z)
          audio.birdCall(
            birdPan(player.x, player.z, player.yaw, caller.x, caller.z),
            birdGain(dist, BIRD_CALL_RADIUS),
          )
        }
      }

      // A tap stands for "aim at it and press E" in one motion — see
      // game/touchControls.ts's own doc comment for why a crosshair is not
      // the right aim model for a thumb.
      const tap = touch.consumeTap()
      if (tap) {
        const target = nearestInView(camera, mushroomCandidates(), REACH, forest.occluders, new THREE.Vector2(tap.x, tap.y))
        // A tap that missed every mushroom still opens/closes the door when
        // the player is standing right at it — touch has no separate `E`.
        if (target) examineTarget(target)
        else if (nearDoor) forest.toggleShelterDoor()
      }
    }

    const bob = cameraBob(player)
    camera.position.set(
      player.x + Math.cos(player.yaw) * bob.dx,
      combinedGround.heightAt(player.x, player.z) + eyeHeight(player) + player.hop + player.stand + bob.dy,
      player.z - Math.sin(player.yaw) * bob.dx,
    )
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    compass.update(player.yaw)
    if (save.prefs.minimap) {
      minimap.update({ x: player.x, z: player.z, heading: headingFromYaw(player.yaw) })
    }
    if (save.prefs.timeMode === 'cycle') cycleT = (cycleT + dt / DAY_LENGTH_SECONDS) % 1
    forest.updateDayNight(timeFor(save.prefs.timeMode, cycleT), camera.position)
    forest.updateClouds(camera.position, dt)
    forest.updateWeather(camera.position, dt)
    forest.updateShelter(dt)
    forest.updateCampfire(dt)
    forest.updateBirds(dt, player.x, player.z)
    forest.updateCritters(dt, player.x, player.z)
    worldStream?.updateCritters(dt, player.x, player.z)
    forest.updateInsects(dt)
    forest.updateTrain(dt)
    forest.updateWater(dt)
    if (flashlightOn) forest.updateFlashlight(camera.position, camera.getWorldDirection(camDir))

    cullDistantMushrooms()
    forest.updateMushroomLod(camera)
    worldStream?.updateLod(camera)
    updateAim()
    updateDebugOverlay()
    renderer.render(forest.scene, camera)

    // Boot-check needs only a handful of frames, and can't afford more: a few
    // rather than exactly one gives the compositor a chance to actually
    // present what was drawn before the loop stops.
    if (window.__BOOTCHECK && ++bootFrames >= 3) renderer.setAnimationLoop(null)
  })

  window.__READY = true
}

void main().catch((e) => console.error('itffm: failed to start', e))
