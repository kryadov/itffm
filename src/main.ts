import * as THREE from 'three'
import { createForest } from './game/scene'
import { createWorldStream } from './game/worldStream'
import { DEFAULT_WORLD_SIZE } from './ui/worldSize'
import { loadForestData, type LoadStage } from './game/loadForest'
import { createControls } from './game/controls'
import { createTouchControls } from './game/touchControls'
import { AudioEngine } from './audio/audio'
import { crossedFootstep, footstepSubstrate } from './audio/footsteps'
import { footSide } from './world/tracks'
import { nearestWater, waterAmbienceGain, type WaterBody } from './audio/waterAmbience'
import { campfireGain } from './audio/musicAmbience'
import { classifyWater } from './world/water'
import { distanceToRing } from './util/geometry'
import {
  stepPlayer, eyeHeight, cameraBob, biomeSpeedFactor, ridingSpeedFactor, type PlayerState,
  type Obstacle,
} from './game/player'
import { chooseStartPose } from './game/startPose'
import { createBasket, nearestInView, nearestScrubInView, canPick, debugRaycastHits } from './game/pick'
import type { Placement } from './ecology/spawn'
import { createHud } from './ui/hud'
import { createCompass } from './ui/compass'
import { createMinimap, headingFromYaw } from './ui/minimap'
import { buildMinimapMarkers, type Landmark } from './quest/markers'
import { QUEST_MARKER_COLOR } from './quest/colors'
import { openQuestGuide } from './ui/questGuide'
import { openInspect } from './ui/inspect'
import { openEncyclopedia } from './ui/encyclopedia'
import { openPlacePicker, showLoading } from './ui/placePicker'
import { createAttractBackdrop } from './ui/attractBackdrop'
import { yieldToPaint } from './util/yield'
import { createBikeView } from './game/bikeView'
import { easeToward, forwardSpeedOf } from './game/bikeSteer'
import { renderCollectiblePreview } from './ui/preview'
import { openSettingsMenu } from './ui/settingsMenu'
import { createUpdateBanner } from './ui/updateBanner'
import { timeFor, nightFactor, DAY_TIME } from './world/daynight'
import { autoWeather, WEATHER_SPELL_SECONDS, type Weather } from './world/weather'
import { gameDaysElapsed, realMonthAt, DAYS_PER_MONTH } from './world/calendar'
import { speciesById, loadSpecies } from './species/load'
import { HITBOX_RADIUS } from './collectible/build'
import { DOOR_INTERACT_RADIUS } from './world/shelter'
import {
  emptySave, loadSave, persistSave, applyFind, setFindNote, readBikeSpot, readDrone, resetQuests,
  type SaveData, type DroneOrder,
} from './save/store'
import {
  launchDrone, stepDrone, treeObstacles, droneReadout, DRONE, type DroneState, type DroneObstacle,
} from './game/drone'
import { buildPilotFigure, buildPilotBeacon } from './world/pilotFigure'
import { createDroneHud } from './ui/droneHud'
import { stationOccupies, stationToWorld, portalSites } from './world/railway'
import { setLang, getLang, t, speciesName } from './i18n/i18n'
import { placeQuestItems, type QuestObstacle } from './quest/placement'
import { interact } from './quest/state'
import { QUEST_ITEM_IDS, type QuestItemId, type Quests } from './quest/types'
import { chopScrub } from './quest/scrub'
import { lampIsOn } from './quest/lamp'
import { buildScrubMesh } from './world/scrub'
import { jitterDiamondGeometry, DIAMOND_GEM_SEED } from './world/diamondGem'
import {
  buildAxeModel, buildLampModel, buildBikeModel, buildRodPickupModel, layFlatOnGround, ROD_PICKUP_HALF_LENGTH,
} from './world/questItemModels'

declare global {
  // boot-check waits on __READY: it is set only if the module ran to the end.
  // __BOOTCHECK tells us we are inside that headless run: it skips the place
  // picker and the network entirely and goes straight to the offline demo
  // wood, so the check never depends on Overpass, Nominatim or tile servers
  // being reachable from wherever it runs.
  interface Window { __READY?: boolean; __BOOTCHECK?: boolean; __trainAt?: (end: 0 | 1) => void }
}

/** How often a long-lived session asks the browser to check for a new
 *  release, on top of whatever the browser already does on its own on
 *  navigation — a session that never navigates (this game can run for
 *  hours, real time) would otherwise not learn about a new deploy at all. */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

// PWA: an icon on the home screen and a wood that still opens with no signal
// once it has been visited once. Registered outside main() and unguarded by
// __BOOTCHECK — this is independent of the game ever loading, and a failed
// registration (an older browser, a disabled service worker) is silently
// fine either way, the same as any other progressive enhancement.
//
// A new version showing up mid-play is told apart from the very first ever
// visit the same way: `public/sw.js` calls `skipWaiting()`/`clients.claim()`,
// so on a first visit too the registering worker ends up "controlling" the
// page and fires `controllerchange` — but only an *update* replaces a worker
// that was already controlling it. Capturing whether a controller already
// existed at the moment a new worker starts installing (`updatefound`) is
// what tells the two apart; a first visit's own `updatefound` sees no
// controller yet, so its `controllerchange` is left unannounced.
const updateBanner = createUpdateBanner(() => location.reload())
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        let hadController = !!navigator.serviceWorker.controller
        reg.addEventListener('updatefound', () => {
          hadController = !!navigator.serviceWorker.controller
        })
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (hadController) updateBanner.show()
        })
        setInterval(() => void reg.update().catch(() => {}), UPDATE_CHECK_INTERVAL_MS)
        addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {})
        })
      })
      .catch(() => {})
  })
}

/** How far you can reach to pick, metres. */
const REACH = 3
const BASKET_CAPACITY = 24
/** How close to a pond/stream ring a footstep reads as "water" underfoot —
 *  close enough to be at its edge, not merely somewhere in view of it. */
const WATER_FOOTSTEP_RADIUS = 1.5
/** How far apart the bicycle's tyre-track marks land, metres — see
 *  world/tracks.ts. */
const BIKE_TRACK_SPACING = 0.4
/** Real distance culling for static scatter (trees, boulders, deadwood,
 *  undergrowth, flora, grass) — see world/instanceCulling.ts and TODO.md's
 *  "…но БЕЗ отсечения по дальности". Set past the fog's own far distance
 *  (game/scene.ts's `Fog(...,30,140)`) plus a margin, not tied to
 *  `save.prefs.drawDistance` (which only ever governed mushroom culling, at
 *  a much shorter 20-80m): fog already hides everything past ~140m, so
 *  culling right at that edge removes nothing the player could actually see
 *  pop, only what the GPU was rasterizing for nothing. */
const SCATTER_CULL_RADIUS = 155
/** How many frames between scatter-culling sweeps — real, not per-frame,
 *  cost: each sweep is one pass over every static-scatter instance (trees,
 *  boulders, deadwood, undergrowth, flora, grass; a few thousand in a
 *  typical wood), cheap on its own but wasted work to repeat 60 times a
 *  second for something that only changes as fast as the player walks.
 *  Every 20th frame is roughly three times a second at 60fps — an instance
 *  crossing the cull radius shows up within a third of a second, not
 *  perceptible as a pop, while cutting the sweep's own CPU cost by 20x. */
const SCATTER_CULL_INTERVAL_FRAMES = 20
/** How far water ambience carries, metres — past the fog's own near
 *  distance (30m, `game/scene.ts`) so it is audible before it is clearly
 *  visible, short of the fog's far distance (140m) so it stays a landmark
 *  rather than a constant hum everywhere in the wood. */
const WATER_AMBIENCE_RADIUS = 45
/** How close to the campfire its own music track takes over from the
 *  day/night bed, metres — world/campfire.ts's own CAMPFIRE_RADIUS (1.3m,
 *  the fire's footprint) plus enough margin that a player sitting on the
 *  bench around it is well inside, not right at the fade's own edge. */
const CAMPFIRE_MUSIC_RADIUS = 8
/** Real seconds for one full day/night loop in 'cycle' mode. */
const DAY_LENGTH_SECONDS = 600
/** Seed offset for the wood's four quest items (world/railway.ts's own
 *  RAIL_SEED_OFFSET is 29, game/scene.ts's train sits at seed + 30 — this is
 *  the next free slot, so quest placement never draws from the same stream
 *  as anything else the wood already seeds). Each item then derives its own
 *  seed from this one (see quest/placement.ts's placeQuestItems). */
const QUEST_SEED_OFFSET = 31
/** How far from the line of a standing train, metres, the diamond can still be handed over:
 *  the whole width of a platform. */
const TRAIN_HANDIN_REACH = 3.2

/** The train's dot on the minimap. */
const TRAIN_MARKER_COLOR = '#ffd45a'

/** Fixed landmark colors — shelter keeps the minimap's original amber
 *  unchanged, mine and campfire get their own so the three are never
 *  confused for each other or for a quest-item hint. */
const LANDMARK_COLOR = { shelter: '#d8a04a', mine: '#6f7f8f', campfire: '#e2564a', station: '#b0653a' }
/** Which i18n key names each item's own completion message — see
 *  i18n/i18n.ts's questCompleteAxe/Lamp/Rod/Bike/Diamond. */
const QUEST_COMPLETE_KEY: Record<
  QuestItemId,
  'questCompleteAxe' | 'questCompleteLamp' | 'questCompleteRod' | 'questCompleteBike' | 'questCompleteDiamond'
> = {
  axe: 'questCompleteAxe',
  lamp: 'questCompleteLamp',
  rod: 'questCompleteRod',
  bike: 'questCompleteBike',
  diamond: 'questCompleteDiamond',
}
/** What a toast says when the rod or the bicycle comes into your hands (out in
 *  the wood or from the hut) — the two you use while carrying them. */
const TOOK_KEY: Partial<Record<QuestItemId, 'questTookRod' | 'questTookBike'>> = {
  rod: 'questTookRod',
  bike: 'questTookBike',
}

/** Which i18n key names each item's own display name — see ui/questGuide.ts's
 *  own identical map; kept local rather than imported, same as every other
 *  small per-file lookup table in this module (LANDMARK_COLOR, above). */
const QUEST_ITEM_NAME_KEY: Record<
  QuestItemId,
  'questItemNameAxe' | 'questItemNameLamp' | 'questItemNameRod' | 'questItemNameBike' | 'questItemNameDiamond'
> = {
  axe: 'questItemNameAxe',
  lamp: 'questItemNameLamp',
  rod: 'questItemNameRod',
  bike: 'questItemNameBike',
  diamond: 'questItemNameDiamond',
}
/** The diamond's own pickup mesh reads as a gem, not another coloured
 *  cylinder like the other four — the rest still share `questItemGeo`
 *  (below), since only the diamond needs its own shape to be legible as a
 *  trophy rather than one more errand marker. */
const DIAMOND_GEO = jitterDiamondGeometry(DIAMOND_GEM_SEED)
/** Below this distance the quest's HUD readout reads "near" rather than
 *  "far" — see i18n's questDistanceNear/questDistanceFar. */
const QUEST_NEAR_RADIUS = 15

/** `grow` is main.ts's own last stage: `loadForestData` is done by then, but
 *  the wood's mushrooms are still being built (see `buildPlacements`). */
type BootStage = LoadStage | 'grow'
const STAGE_KEY: Record<BootStage, 'stageGeocode' | 'stageOsm' | 'stageTerrain' | 'stageBuild' | 'stageGrow'> = {
  geocode: 'stageGeocode',
  osm: 'stageOsm',
  terrain: 'stageTerrain',
  build: 'stageBuild',
  grow: 'stageGrow',
}
const STAGE_ORDER: BootStage[] = ['geocode', 'osm', 'terrain', 'build', 'grow']
/** Where the bar sits once `stage` has started, 0..1. */
const stageFraction = (stage: BootStage): number => (STAGE_ORDER.indexOf(stage) + 1) / STAGE_ORDER.length
/** How long one slice of mushroom-building may hold the thread before the
 *  loading screen gets a frame — short enough that the spinner keeps turning. */
const GROW_SLICE_MS = 30

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
  const saveLoaded = loadSave().then((loaded) => {
    save = loaded
    setLang(save.lang)
  })

  // The real demo wood, actually loaded and simulated, behind the place
  // picker and (below) the loading screen — the same idea race-the-city's
  // own "attract mode" uses. Skipped under boot-check, which never shows the
  // picker at all (see the __BOOTCHECK branch just below). Stopped once the
  // real game's first frame renders (search `backdrop.stop()`).
  const backdrop = window.__BOOTCHECK ? null : createAttractBackdrop(app)
  backdrop?.start()

  const [query, pickedHalfSize] = window.__BOOTCHECK
    ? [null, DEFAULT_WORLD_SIZE.halfSize]
    : await new Promise<[string | null, number]>((resolve) =>
        openPlacePicker(
          (q, hs) => resolve([q, hs]),
          (lang) => {
            save = { ...save, lang }
            void persistSave(save)
          },
          () => save.prefs,
          (prefs) => {
            save = { ...save, prefs }
            void persistSave(save)
          },
          // Quests can be reset from the picker's own settings too — after the
          // save has actually loaded, or the load would put them straight back.
          () => {
            void saveLoaded.then(() => {
              save = resetQuests(save)
              void persistSave(save)
            })
          },
        ),
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

  if (fellBackTo && query) toast(t('fellBackNotice'))

  // The demo wood always builds its own home plot at CHUNK_SIZE/2 (see
  // game/loadForest.ts and docs/superpowers/specs/2026-09-10-infinite-world-
  // design.md), regardless of what the world-size picker asked for — this
  // `halfSize` is what was actually built, not necessarily `pickedHalfSize`,
  // or the home plot and its streamed surroundings below would disagree
  // about where the reserved chunk (0, 0) actually ends.
  // The wood's own accelerated calendar (world/calendar.ts) — computed once
  // per load rather than re-read every frame, since spawn only ever runs
  // once per wood/chunk build anyway; the visible day/night cycle has its
  // own separate, per-frame clock (see updateDayNight below). Anchored to
  // the real month the save actually began in (realMonthAt) — see that
  // function's own doc comment for the live report this fixed.
  const gameDays =
    gameDaysElapsed(save.calendarStart, Date.now()) + (realMonthAt(save.calendarStart) - 1) * DAYS_PER_MONTH
  // The loading screen stays up until every mushroom has a mesh: building
  // them all in one go was ~85% of the whole load, a single freeze that took
  // the spinner with it (a live report, 2026-09-19: "it starts spinning and
  // then hangs", 20-30 s on a large wood). Sliced instead, with a frame for
  // the spinner and the bar between slices.
  loading.update(t(STAGE_KEY.grow), stageFraction('build'))
  await yieldToPaint()
  const forest = createForest(source, seed, halfSize, groundSegments, gameDays, true)
  const totalPlacements = forest.pendingPlacements()
  const growFrom = stageFraction('build')
  while (forest.buildPlacements(GROW_SLICE_MS) > 0) {
    const done = 1 - forest.pendingPlacements() / Math.max(1, totalPlacements)
    loading.update(t(STAGE_KEY.grow), growFrom + (stageFraction('grow') - growFrom) * done)
    await yieldToPaint()
  }
  // The loading screen is closed by the render loop, after the first frame
  // has actually been drawn (see `loadingOpen` below) — not here.
  // What the sky is actually doing: the fixed pick, or the auto weather's
  // current draw (see the render loop).
  const weatherNow = (clockT: number): Weather =>
    save.prefs.weatherMode === 'auto'
      ? autoWeather(seed, Math.floor(weatherClock / WEATHER_SPELL_SECONDS), clockT)
      : save.prefs.weatherMode
  let weatherClock = 0
  let shownWeather = weatherNow(timeFor(save.prefs.timeMode, DAY_TIME))
  forest.setWeather(shownWeather)
  forest.setTracksEnabled(save.prefs.groundTracks)
  // Infinite wilderness beyond the home plot — the demo wood only
  // (fellBackTo === 'demo' covers both a deliberate "just show the forest"
  // press and a real query that failed and fell back to it; either way it
  // is the same wood built the same way, see loadForestData). A named real
  // place keeps its old, bounded behaviour untouched.
  const worldStream =
    fellBackTo === 'demo' ? createWorldStream(forest.scene, seed, forest.ground, halfSize, loadSpecies(), gameDays) : null
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
  // The bicycle in your hands (its bar and front wheel, low in the view) while
  // you are carrying it home — see game/bikeView.ts. Gone the moment it is left
  // against the hut, and never there before it is picked up.
  const bikeView = createBikeView(forest.scene)
  // Carrying the bicycle IS riding it: the handlebar is in your view, so you
  // go faster, the camera stops swaying like a walk, and no footsteps sound
  // (a live report, 2026-09-20: it looked like a bike and moved like a walk).
  const isRiding = (): boolean => quests.bike.state === 'carrying'
  // Fishing needs the rod in your hands, not merely delivered: it waits in the
  // hut until you take it (the owner's decision, 2026-09-21).
  const rodInHand = (): boolean => quests.rod.state === 'carrying'
  // 1 walking, 0 riding — eased, so mounting and dismounting do not snap.
  let bobScale = 1
  // Distance covered since the bicycle last laid a tyre-track mark — see
  // BIKE_TRACK_SPACING.
  let bikeTrackAcc = 0
  let bikePrevX = 0
  let bikePrevZ = 0
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
  audio.setMusicVolume(save.prefs.musicVolume)
  audio.setFootstepVolume(save.prefs.footstepVolume)
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
  minimap.setWorld(source.paths ?? [], source.water ?? [], halfSize, [forest.railPoints])
  minimap.setVisible(save.prefs.minimap)
  // Fixed geography, sited once at load — same three points every session,
  // unlike the quest items' own positions below.
  const landmarks: Landmark[] = [
    { position: forest.shelter, color: LANDMARK_COLOR.shelter },
    { position: forest.mine, color: LANDMARK_COLOR.mine },
    { position: forest.campfire, color: LANDMARK_COLOR.campfire },
    // Each station: the middle of its platform.
    ...forest.stations.map((s) => ({
      position: stationToWorld(s, 0, 1.8),
      color: LANDMARK_COLOR.station,
    })),
  ]

  // Classified once at load — `classifyWater` is pure per-ring geometry, not
  // something that changes while the player walks, so there is no reason to
  // re-run it every frame the way `nearestWater` (audio/waterAmbience.ts)
  // itself must.
  const waterBodies: WaterBody[] = (source.water ?? [])
    .filter((ring) => ring.length >= 2)
    .map((ring) => ({ ring, kind: classifyWater(ring) }))

  // The wood's five quest items (see docs/superpowers/specs/2026-09-13-quest-
  // items-design.md, extending the single fetch quest of v0.88.0, plus the
  // diamond added in v0.91.0): each sited deterministically from the world
  // seed, same as everything else about this wood, so a fresh game always
  // finds them in the same places a returning save already remembers.
  // Recomputed on every load regardless — cheap, pure, and deterministic —
  // so every item's own thicket/water detour obstacles are always available
  // for the physics step below even when `save.quests` already carries
  // their positions and states from an earlier session. The diamond's own
  // position comes from the wood's mine (forest.diamondSpot), not this
  // module's own RNG — see placeQuestItems's own doc comment.
  const questPlacements = placeQuestItems(
    seed + QUEST_SEED_OFFSET, forest.shelter, source.water ?? [], (x, z) => forest.ground.heightAt(x, z),
    forest.diamondSpot,
  )
  const isFreshQuests = !save.quests
  const isNewDiamond = !isFreshQuests && !save.quests?.diamond
  const quests: Quests = {} as Quests
  for (const id of QUEST_ITEM_IDS) {
    quests[id] = save.quests?.[id] ?? { position: questPlacements[id].position, state: 'pending' }
  }
  // The mine was redrawn (its tunnels, size and site all changed — see
  // world/mine.ts), so a diamond position saved against the old one would now
  // be inside solid rock. Where the diamond lies is a pure function of the
  // wood's seed, so a pending one is simply put back at the mine's current spot.
  if (quests.diamond.state === 'pending') quests.diamond = { ...quests.diamond, position: forest.diamondSpot }
  if (isFreshQuests) {
    save = { ...save, quests }
    void persistSave(save)
    toast(t('questPrompt'))
  } else if (isNewDiamond) {
    // A save from before the diamond quest existed: it gets the same
    // per-key fallback as any other missing quest (the loop above), but
    // silently — `isFreshQuests`'s own toast only fires for a brand-new
    // game, so a returning player would otherwise never learn the mine now
    // holds something.
    save = { ...save, quests }
    void persistSave(save)
    toast(t('questPromptDiamond'))
  }

  // The quadcopter the diamond earns (save.drone): handed to the train, then a
  // crate left at the other end of the line, then in your hands.
  let droneOrder: DroneOrder | undefined = readDrone(save.drone)
  // The diamond used to be delivered to the hut and sat on the table; it goes to
  // the train now. A save that already "delivered" it has nothing to show for it
  // and no quadcopter, so the diamond is put back in the player's pocket.
  if (quests.diamond.state === 'done' && !droneOrder) {
    quests.diamond = { ...quests.diamond, state: 'carrying' }
    save = { ...save, quests }
    void persistSave(save)
    toast(t('questTookDiamondBack'))
  }

  // Every quest item's own thicket-detour scrub — a `let`, not a `const`,
  // because the hatchet (`tryChopScrub` below) replaces this with a shorter
  // array (via `chopScrub`, a pure function) the moment the axe quest is
  // done and the player chops one down. `baseObstacles` (trees + everything
  // else `createForest` already built) never changes, so only this list
  // needs to be recombined with it on every physics step.
  let scrubObstacles: QuestObstacle[] = QUEST_ITEM_IDS.flatMap((id) => questPlacements[id].obstacles)
  const baseObstacles: Obstacle[] = [
    ...forest.trees.map((tr) => ({ x: tr.x, z: tr.z, radius: tr.radius })),
    ...forest.extraObstacles,
  ]
  // Recomputed fresh wherever it's read (never a frozen snapshot): `chopScrub`
  // replaces `scrubObstacles` with a new, shorter array rather than mutating
  // the old one in place, so anything reading a stale `[...baseObstacles,
  // ...scrubObstacles]` array from before a chop would still collide with a
  // bush that is no longer there.
  const currentObstacles = (): Obstacle[] => [...baseObstacles, ...scrubObstacles]

  // One real, identifiable mesh per scrub circle (see world/scrub.ts) — a
  // player has to be able to see and aim at the thing a hatchet would
  // remove, not just bump into an invisible obstacle. Kept in a map by the
  // same id the obstacle circle carries, so chopping one down (below) can
  // find and drop both together.
  const scrubMeshes = new Map<string, THREE.Mesh>()
  for (const o of scrubObstacles) {
    const mesh = buildScrubMesh(o, forest.ground)
    forest.scene.add(mesh)
    scrubMeshes.set(o.id, mesh)
  }
  const startPose = chooseStartPose(currentObstacles(), halfSize, forest.shelter)
  let player: PlayerState = {
    x: startPose.x, z: startPose.z, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0,
    bobPhase: 0,
  }
  // Dev only, and only under ?debug (the F3 panel's own switch): tp=x,z puts the
  // player at a world point, and train=N runs the train N seconds ahead before
  // the walk begins, so a test can stand at a platform with the train in instead
  // of waiting minutes of game time for it. (CLAUDE.md, Commands.)
  {
    const q = new URLSearchParams(location.search)
    if (q.has('debug')) {
      const tp = q.get('tp')?.split(',').map(Number)
      if (tp && tp.length === 2 && tp.every(Number.isFinite)) player = { ...player, x: tp[0], z: tp[1] }
      // tp=station0 / tp=station1: on that platform, facing the track.
      const stationTp = /^station([01])$/.exec(q.get('tp') ?? '')
      if (stationTp) {
        const st = forest.stations[Number(stationTp[1])]
        const back = Number(q.get('back')) || 0 // metres further from the track, for a view of the whole train
        const at = stationToWorld(st, Number(q.get('along')) || 0, 1.8 + back)
        // Facing across the track: yaw so that -z (the camera's forward at yaw 0) turns to the track side.
        const towardTrack = { x: st.cx - at.x, z: st.cz - at.z }
        player = { ...player, x: at.x, z: at.z, yaw: Math.atan2(-towardTrack.x, -towardTrack.z) }
      }
      // tp=portal0 / tp=portal1: 4 m (plus back=) in front of that tunnel mouth, facing it.
      const portalTp = /^portal([01])$/.exec(q.get('tp') ?? '')
      if (portalTp) {
        const site = portalSites(forest.railLine)[Number(portalTp[1])]
        player = { ...player, x: site.x - site.ox * (4 + (Number(q.get('back')) || 0)), z: site.z - site.oz * (4 + (Number(q.get('back')) || 0)), yaw: Math.atan2(-site.ox, -site.oz) }
      }
      const yawDeg = Number(q.get('yaw'))
      if (q.has('yaw') && Number.isFinite(yawDeg)) player = { ...player, yaw: (yawDeg * Math.PI) / 180 }
      const ahead = Number(q.get('train'))
      if (Number.isFinite(ahead) && ahead > 0) for (let i = 0; i < Math.min(ahead, 6000); i++) forest.updateTrain(1)
      // window.__trainAt(end) does the same on demand, for a test driving the built game.
      window.__trainAt = (end) => {
        for (let i = 0; i < 6000 && forest.trainStopped()?.end !== end; i++) forest.updateTrain(1)
      }
      // trainAt=0|1: run the train until it stands at that platform.
      const trainAt = q.get('trainAt')
      if (trainAt === '0' || trainAt === '1') {
        for (let i = 0; i < 6000 && forest.trainStopped()?.end !== Number(trainAt); i++) forest.updateTrain(1)
      }
    }
  }
  let aimed: THREE.Object3D | null = null
  // Whether the player is close enough to the shelter's own doorway for `E`
  // to open/close it instead of examining an aimed mushroom — a plain
  // distance check (game/pick.ts's crosshair raycast is for a mushroom you
  // aim at; a doorway is a fixed, room-sized target you just walk up to).
  let nearDoor = false

  // Each quest item itself: a standalone mesh (no carried-item mesh in hand
  // for v1, per the design doc) that sits at its own position while
  // `pending` and disappears the instant it's picked up — cosmetic, not the
  // objective's own state, which lives in `quests` above. Axe, lamp, rod and
  // bike each get their own real-world-shaped model
  // (`world/questItemModels.ts`, shared with the shelter's own rod/bike
  // trophies) instead of a shared coloured cylinder (a live report,
  // 2026-09-15: it wasn't clear at a glance what you were even picking up).
  const questItemMeshes = {} as Record<QuestItemId, THREE.Object3D | null>
  function showQuestItem(id: QuestItemId): void {
    const pos = quests[id].position
    let obj: THREE.Object3D
    switch (id) {
      case 'axe':
        obj = buildAxeModel()
        break
      case 'lamp':
        obj = buildLampModel().group
        break
      case 'rod': {
        // Laid flat, not standing 1.5m straight up out of the grass — there's
        // no wall to lean it on out here, unlike the shelter's own trophy. Its
        // own chunkier, lifted model (not the wall trophy's thin pole, which
        // vanished under a trail), pitched along the real slope. Its height is
        // relative to `pos.y`, which is added below with everything else.
        obj = buildRodPickupModel()
        const lay = layFlatOnGround(pos.x, pos.z, ROD_PICKUP_HALF_LENGTH, (x, z) => forest.ground.heightAt(x, z))
        obj.rotation.z = lay.pitch
        obj.position.y = lay.y - pos.y
        break
      }
      case 'bike':
        obj = buildBikeModel()
        break
      case 'diamond':
        obj = new THREE.Mesh(
          DIAMOND_GEO,
          new THREE.MeshStandardMaterial({
            color: 0xbfe8ff,
            roughness: 0.05,
            metalness: 0.1,
            // Starts dark — updated every frame in the animation loop below,
            // once the player's lamp is close enough and lit to matter (see
            // docs/superpowers/specs/2026-09-15-mine-cave-design.md §7).
            emissive: new THREE.Color(0x8fd8ff),
            emissiveIntensity: 0,
          }),
        )
        obj.position.y = 0.2
        break
    }
    obj.position.x += pos.x
    obj.position.y += pos.y
    obj.position.z += pos.z
    forest.scene.add(obj)
    questItemMeshes[id] = obj
  }
  function hideQuestItem(id: QuestItemId): void {
    questItemMeshes[id]?.removeFromParent()
    questItemMeshes[id] = null
  }
  // Three of the five items leave a trophy visible at the shelter once
  // delivered (world/shelter.ts's own setters) — the hatchet and lamp don't,
  // since their own abilities (choppable scrub, the carried light) are
  // already the visible proof they're owned.
  const TROPHY_SETTER: Partial<Record<QuestItemId, (on: boolean) => void>> = {
    rod: forest.setRodPlaced,
    bike: forest.setBikePlaced,
  }
  for (const id of QUEST_ITEM_IDS) {
    if (quests[id].state === 'pending') showQuestItem(id)
    if (quests[id].state === 'done') {
      if (id === 'bike') forest.setBikePlaced(true, readBikeSpot(save.bikeSpot))
      else TROPHY_SETTER[id]?.(true)
    }
  }
  // Where the quadcopter is in its story: the crate on its platform, or the
  // empty box on the hut's table.
  // An order placed in an earlier visit has long since been delivered: the train
  // was not there to be watched, but the crate is.
  if (droneOrder?.stage === 'ordered') {
    droneOrder = { ...droneOrder, stage: 'crate' }
    save = { ...save, drone: droneOrder }
    void persistSave(save)
  }
  if (droneOrder?.stage === 'crate') forest.setDroneCrate(droneOrder.crateEnd)
  if (droneOrder?.stage === 'owned') forest.setDroneBoxPlaced(true)

  /**
   * Where the diamond is handed in: the car of a train standing at a platform
   * nearest the player, or null when no train stands at one.
   */
  function trainHandIn(): { x: number; z: number } | null {
    const stopped = forest.trainStopped()
    if (!stopped) return null
    // Along the whole standing train, not a car's centre: anyone on the platform
    // beside any of it can hand the diamond over.
    let best = { x: stopped.cars[0].x, z: stopped.cars[0].z }
    let bestD = Infinity
    for (let i = 0; i < stopped.cars.length - 1; i++) {
      const a = stopped.cars[i]
      const b = stopped.cars[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz || 1
      const t = Math.max(0, Math.min(1, ((player.x - a.x) * dx + (player.z - a.z) * dz) / len2))
      const p = { x: a.x + dx * t, z: a.z + dz * t }
      const d = Math.hypot(p.x - player.x, p.z - player.z)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    // Anywhere on the platform beside the train counts as beside it.
    return bestD <= TRAIN_HANDIN_REACH ? { x: player.x, z: player.z } : best
  }

  /**
   * Where a delivered item can be taken from again, or null if it cannot: the
   * rod stands inside the hut (so only from inside it, not through its wall),
   * the bicycle wherever it was left. The other three are not for taking back.
   */
  function takeSpot(id: QuestItemId): { x: number; z: number } | null {
    if (id === 'rod') return forest.insideHut(player.x, player.z) ? forest.homeSpot('rod') : null
    if (id === 'bike') return forest.homeSpot('bike', readBikeSpot(save.bikeSpot))
    return null
  }

  /**
   * One press of `E` for every quest item at the player's position — at most
   * one transition each (see quest/state.ts's `interact`): pick up, deliver,
   * or take back from the hut. A no-op for an item unless it is in the matching
   * state and in range, so calling it for all five is safe and mirrors the
   * shelter door's own "just walk up and press E" feel. Returns whether
   * anything actually happened, so the caller (the `E` keydown handler and
   * the touch tap handler) knows whether to fall through to the door check /
   * mushroom examination instead.
   */
  function tryQuestInteract(): boolean {
    let changed = false
    for (const id of QUEST_ITEM_IDS) {
      const before = quests[id].state
      // The bicycle is left against whichever wall of the hut the player is
      // standing at, not handed in at the doorway like the rest: its delivery
      // point is the nearest point on the hut's outline.
      const bikeDrop = id === 'bike' ? forest.bikeSpotNear(player) : null
      quests[id] = interact(
        quests[id], player,
        { deliverAt: id === 'diamond' ? trainHandIn() : bikeDrop?.point ?? forest.shelterDoor, takeFrom: takeSpot(id) },
        DOOR_INTERACT_RADIUS,
      )
      const now = quests[id].state
      if (now === before) continue
      changed = true
      if (before === 'pending') hideQuestItem(id)
      if (now === 'carrying') {
        // Picked up out in the wood, or taken again from the hut: in hand.
        if (before === 'done') TROPHY_SETTER[id]?.(false)
        const took = TOOK_KEY[id]
        if (took) toast(t(took))
      }
      if (now === 'done') {
        toast(t(QUEST_COMPLETE_KEY[id]))
        if (id === 'diamond') {
          // Handed to the conductor: the crate is left at the OTHER end of the line.
          const stopped = forest.trainStopped()
          droneOrder = { stage: 'ordered', crateEnd: stopped && stopped.end === 1 ? 0 : 1 }
          save = { ...save, drone: droneOrder }
          // The train takes the parcel and pulls out shortly, for the other end.
          forest.trainDepartSoon()
        } else if (id === 'bike' && bikeDrop) {
          save = { ...save, bikeSpot: bikeDrop.spot }
          forest.setBikePlaced(true, bikeDrop.spot)
        } else {
          TROPHY_SETTER[id]?.(true)
        }
      }
    }
    if (!changed && quests.diamond.state === 'carrying' && !trainHandIn() && stationOccupies(forest.stations, player.x, player.z, 5)) {
      // Standing at a platform with the diamond, but no train is in: say so.
      toast(t('diamondWaitTrain'))
      return true
    }
    if (!changed) return false
    save = { ...save, quests }
    void persistSave(save)
    return true
  }

  /** `E` at the crate the train left on the platform: the quadcopter is yours. */
  function tryDroneCrate(): boolean {
    if (droneOrder?.stage !== 'crate') return false
    const c = forest.crateSpot(droneOrder.crateEnd)
    if (Math.hypot(player.x - c.x, player.z - c.z) > DOOR_INTERACT_RADIUS) return false
    droneOrder = { ...droneOrder, stage: 'owned' }
    save = { ...save, drone: droneOrder }
    void persistSave(save)
    forest.setDroneCrate(null)
    forest.setDroneBoxPlaced(true)
    toast(t('droneOwned'))
    return true
  }

  // ---------------------------------------------------------------------
  // The quadcopter. R launches it and the camera becomes ITS camera; the player
  // stays where they stood, drawn as a little person with the controller.
  const droneHud = createDroneHud(ui)
  const pilotFigure = buildPilotFigure()
  const pilotBeacon = buildPilotBeacon()
  const FLIGHT_FOV = 84
  const walkingFov = camera.fov
  let droneBattery = 1
  let flight: DroneState | null = null
  let returnRequested = false
  // Where the wood's trees stand for it to bump into: the home plot's once, the
  // streamed chunks' trunks near it now and then (their heights are not known,
  // so those are tall enough to clear only from above the canopy).
  let droneStatic: DroneObstacle[] | null = null
  let droneNear: DroneObstacle[] = []
  let droneNearAge = 0
  // Where the wood is being kept alive: the player's own spot, or the drone's
  // while it flies (streaming, culling and the animals follow the camera).
  let focusX = 0
  let focusZ = 0

  function droneObstacles(f: DroneState): DroneObstacle[] {
    if (!droneStatic) {
      droneStatic = treeObstacles(forest.trees)
      const g = combinedGround.heightAt(forest.shelter.x, forest.shelter.z)
      droneStatic.push({ x: forest.shelter.x, z: forest.shelter.z, radius: 2.7, y0: g - 1, y1: g + 4 }) // the hut
    }
    if (worldStream && ++droneNearAge >= 20) {
      droneNearAge = 0
      droneNear = worldStream
        .obstacles()
        .filter((o) => Math.hypot(o.x - f.x, o.z - f.z) < 40)
        .map((o) => {
          const h = worldStream.heightAt(o.x, o.z)
          return { x: o.x, z: o.z, radius: o.radius, y0: h - 1, y1: h + 26 }
        })
    }
    return droneNear.length > 0 ? [...droneStatic, ...droneNear] : droneStatic
  }

  function launchFlight(): void {
    if (droneOrder?.stage !== 'owned' || flight || modalOpen() || player.airborne) return
    if (forest.playerInsideMine(player.x, player.z) || forest.insideHut(player.x, player.z)) {
      toast(t('droneNoIndoors'))
      return
    }
    if (droneBattery < 0.1) {
      toast(t('droneCharging'))
      return
    }
    flight = { ...launchDrone({ x: player.x, z: player.z, yaw: player.yaw }, combinedGround, droneBattery), pitch: player.pitch }
    pilotFigure.group.position.set(player.x, combinedGround.heightAt(player.x, player.z), player.z)
    pilotFigure.group.rotation.y = player.yaw
    pilotBeacon.position.copy(pilotFigure.group.position)
    forest.scene.add(pilotFigure.group, pilotBeacon)
    camera.fov = FLIGHT_FOV
    camera.updateProjectionMatrix()
    droneHud.show(true)
    const cross = document.getElementById('crosshair')
    if (cross) cross.style.display = 'none'
    hud.setTarget(null)
  }

  function endFlight(): void {
    if (!flight) return
    droneBattery = flight.battery
    flight = null
    returnRequested = false
    forest.scene.remove(pilotFigure.group, pilotBeacon)
    camera.fov = walkingFov
    camera.updateProjectionMatrix()
    droneHud.show(false)
    const cross = document.getElementById('crosshair')
    if (cross) cross.style.display = ''
    audio.droneHum(0, 0)
  }

  /** One frame of flight: the pilot's input to the drone, the world kept alive around it. */
  function stepFlight(dt: number): void {
    if (!flight) return
    if (!modalOpen()) {
      const input = touch.active ? touch.read(dt) : controls.read(dt)
      const lift = Math.max(-1, Math.min(1, (input.lift ?? 0) - (input.crouching || input.sprinting ? 1 : 0)))
      const env = { ground: combinedGround, obstacles: droneObstacles(flight), pilot: { x: player.x, z: player.z } }
      flight = stepDrone(
        flight,
        { forward: input.forward, strafe: input.strafe, lift, dYaw: input.dYaw, dPitch: input.dPitch, returnHome: returnRequested },
        env,
        dt,
      )
      returnRequested = false
      if (flight.landed) {
        endFlight()
        return
      }
      droneHud.update(droneReadout(flight, env), flight.returning)
    }
    worldStream?.update(flight.x, flight.z)
    pilotFigure.update(dt, new THREE.Vector3(flight.x, flight.y, flight.z))
    // The marker pole is for finding home from far off and above the trees; right
    // beside the pilot it only fills the view, and the person is there to see.
    pilotBeacon.visible = Math.hypot(flight.x - player.x, flight.z - player.z) > 12
    audio.droneHum(1, Math.hypot(flight.vx, flight.vz) / DRONE.maxSpeed)
  }

  /**
   * The hatchet's own interaction: only once the axe quest is delivered, `E`
   * facing a scrub object removes it — both the mesh (here) and the
   * obstacle circle (`chopScrub`, quest/scrub.ts). Only ever touches objects
   * built by `thicketObstacles`, tracked in `scrubMeshes`/`scrubObstacles`
   * above — `world/trees.ts`'s batched trees are never in that list, so a
   * mature tree can never be chopped this way.
   *
   * @param point where on screen to aim (see nearestScrubInView) — a touch
   *   tap's own point on mobile, the crosshair centre by default on desktop.
   */
  function tryChopScrub(point?: THREE.Vector2): boolean {
    if (quests.axe.state !== 'done') return false
    const target = nearestScrubInView(camera, [...scrubMeshes.values()], REACH, point)
    if (!target) return false
    const id = target.userData.scrubId as string
    const next = chopScrub(scrubObstacles, id, true)
    if (next === scrubObstacles) return false
    scrubObstacles = next
    target.removeFromParent()
    scrubMeshes.delete(id)
    return true
  }

  /** The quests' own small always-on HUD line — the nearest not-yet-done
   *  item's own distance readout (carrying beats pending, since heading home
   *  is the more pressing goal), and no footprint at all once every item is
   *  `done`, per the design doc. */
  function updateQuestHud(): void {
    const activeId =
      QUEST_ITEM_IDS.find((id) => quests[id].state === 'carrying') ??
      QUEST_ITEM_IDS.find((id) => quests[id].state === 'pending')
    if (!activeId) {
      hud.setQuestDistance(null)
      return
    }
    const q = quests[activeId]
    const target = q.state === 'pending' ? q.position : forest.shelterDoor
    const dist = Math.hypot(player.x - target.x, player.z - target.z)
    const label = dist < QUEST_NEAR_RADIUS ? t('questDistanceNear') : t('questDistanceFar')
    hud.setQuestDistance(`${label} — ${Math.round(dist)}m`)
  }

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
      `weather: ${shownWeather} (${save.prefs.weatherMode}, spell ${Math.floor(weatherClock / WEATHER_SPELL_SECONDS)})`,
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
      const dx = m.position.x - focusX
      const dz = m.position.z - focusZ
      m.visible = dx * dx + dz * dz < limit
    }
  }

  function updateAim(): void {
    if (flight || modalOpen()) {
      aimed = null
      nearDoor = false
      hud.setTarget(null)
      return
    }
    aimed = nearestInView(camera, mushroomCandidates(), REACH, forest.occluders)
    const species = aimed ? speciesById(aimed.userData.placement.speciesId) : undefined
    if (species) {
      nearDoor = false
      hud.setTarget(speciesName(species), canPick(species, rodInHand()) ? undefined : t('needRod'))
      return
    }
    // No mushroom in the crosshair — check for a quest item within pickup
    // range next (tryQuestInteract's own `tryPickUp` uses this same radius,
    // by plain distance rather than aim, so the hint has to use it too or
    // it would show up too early/late compared to when `E` actually works).
    for (const id of QUEST_ITEM_IDS) {
      // Lying out in the wood, or (rod, bicycle) waiting at home to be taken.
      const state = quests[id].state
      const spot = state === 'pending' ? quests[id].position : state === 'done' ? takeSpot(id) : null
      if (!spot) continue
      if (Math.hypot(player.x - spot.x, player.z - spot.z) >= DOOR_INTERACT_RADIUS) continue
      nearDoor = false
      hud.setTarget(t(QUEST_ITEM_NAME_KEY[id]))
      return
    }
    if (droneOrder?.stage === 'crate') {
      const c = forest.crateSpot(droneOrder.crateEnd)
      if (Math.hypot(player.x - c.x, player.z - c.z) < DOOR_INTERACT_RADIUS) {
        nearDoor = false
        hud.setTarget(t('droneCrateName'))
        return
      }
    }
    if (quests.diamond.state === 'carrying') {
      const car = trainHandIn()
      if (car && Math.hypot(player.x - car.x, player.z - car.z) < DOOR_INTERACT_RADIUS) {
        nearDoor = false
        hud.setTarget(t('conductor'))
        return
      }
    }
    // Nothing else nearby — a mushroom never spawns inside the hut, so this
    // and an aimed mushroom are not really in tension in practice.
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
    // The rod's own gate: a fish is visible and aimable, but cannot be taken
    // without the rod in your hands — and says so, and where the rod is, rather
    // than leaving `E` to do nothing (a live report, 2026-09-20: "E does not
    // work on the roach").
    if (!canPick(species, rodInHand())) {
      toast(t(quests.rod.state === 'done' ? 'needRodToastHome' : 'needRodToast'))
      return
    }

    openInspect(
      species,
      placement.seed,
      placement.age,
      () => {
        if (!basket.add(placement)) return
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
        audio.setMusicVolume(prefs.musicVolume)
        audio.setFootstepVolume(prefs.footstepVolume)
        shownWeather = weatherNow(timeFor(prefs.timeMode, cycleT))
        forest.setWeather(shownWeather)
        minimap.setVisible(prefs.minimap)
        forest.setTracksEnabled(prefs.groundTracks)
        void persistSave(save)
      },
      // The wood is already built around the old quests (items lying out, the
      // hatchet's cleared thickets, trophies on the hut), so a reset is saved
      // and the page reloaded back to the start — the same restart "change
      // location" does, and the next load sites every item fresh.
      onResetQuests: () => {
        save = resetQuests(save)
        void persistSave(save).then(() => location.reload())
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
         <h2 style="margin:22px 0 8px;font-size:17px">${t('droneHowToTitle')}</h2>
         <p style="line-height:1.6;margin:0;font-size:14px;opacity:.9">${t('droneHowTo')}</p>
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
         <button id="pause-quests" style="${PAUSE_BTN_STYLE}">${t('questGuideTitle')}</button>
         <button id="pause-tally" style="${PAUSE_BTN_STYLE}">${t('tally')}</button>
       </div>`,
      [],
    )

    // A second Escape, with the menu still open, just closes it again —
    // same as "Continue" (2026-09-15: it used to open the exit confirm,
    // which meant Escape could never simply back out of the pause menu).
    const onEscape = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      closeMenu()
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
    // A full reload back to openPlacePicker() (`ui/placePicker.ts`) — no
    // confirmation, since picking this from the menu is already the
    // deliberate action (2026-09-15: the "exit confirm" dialog this used to
    // route through only existed for a second Escape press, which now just
    // closes the pause menu instead — see onEscape above).
    el.querySelector('#pause-change-location')!.addEventListener('click', () => location.reload())
    el.querySelector('#pause-encyclopedia')!.addEventListener('click', () => {
      closeMenu()
      openEncyclopedia(save, getLang())
    })
    el.querySelector('#pause-quests')!.addEventListener('click', () => {
      closeMenu()
      openQuestGuide(quests)
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
    if (e.code === 'KeyR') {
      // R launches the quadcopter, and brings it home while it flies.
      if (flight) {
        if (!flight.returning) returnRequested = true
      } else launchFlight()
    }
    if (e.code === 'KeyE' && !flight) {
      if (tryQuestInteract()) {
        // handled: picked up or delivered a quest item
      } else if (tryDroneCrate()) {
        // handled: took the quadcopter from its crate
      } else if (tryChopScrub()) {
        // handled: chopped down a scrub object
      } else if (nearDoor) forest.toggleShelterDoor()
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
    if (e.code === 'KeyL' && quests.lamp.state === 'done') lampOn = !lampOn
    if (e.code === 'F3') {
      debugEnabled = !debugEnabled
      ensureDebugEl().hidden = !debugEnabled
    }
  })

  let last = performance.now()
  let bootFrames = 0
  // Counts up every frame; scatter culling only sweeps every
  // SCATTER_CULL_INTERVAL_FRAMES-th one — see that constant's own comment.
  let scatterCullFrame = 0
  // Only read in 'cycle' mode — 'day' and 'night' hold their own fixed time
  // (see world/daynight.ts's timeFor), starting at noon so a first frame
  // rendered before this ever advances still matches the old fixed look.
  let cycleT = DAY_TIME
  // Off at the start of every walk — a session preference, not a saved one:
  // there is no reason a flashlight left on should surprise the next visit.
  let flashlightOn = false
  // On by default once owned, matching the lamp's old always-automatic
  // behaviour — `L` is a manual override on top of `lampIsOn`'s own
  // day/night/mine rule, not a replacement for it, and resets to on at the
  // start of every walk the same way the flashlight resets to off.
  let lampOn = true
  const camDir = new THREE.Vector3()
  // Compiling every shader used to happen inside the first frame, after the
  // loading screen had already gone: seconds of dark, frozen screen. Do it
  // now, while the screen is still up (`compileAsync` does not block on a GPU
  // with parallel shader compilation). Not worth failing the boot over.
  await renderer.compileAsync(forest.scene, camera).catch(() => {})
  let loadingOpen = true
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // The wood is kept alive around the camera: the player, or the drone in flight.
    focusX = flight ? flight.x : player.x
    focusZ = flight ? flight.z : player.z
    if (flight) stepFlight(dt)
    else droneBattery = Math.min(1, droneBattery + dt / 60) // charging on the ground

    // While an overlay is up the player stands still: the mouse/thumb belongs to it.
    if (!flight && !modalOpen()) {
      const inHome = Math.abs(player.x) <= halfSize && Math.abs(player.z) <= halfSize
      const biome = inHome ? source.biomeAt(player.x, player.z) : 'forest-mixed'
      const speed = save.prefs.walkSpeedMultiplier * biomeSpeedFactor(biome) * ridingSpeedFactor(isRiding())
      const input = touch.active ? touch.read(dt) : controls.read(dt)
      const stepObstacles = worldStream ? [...currentObstacles(), ...worldStream.obstacles()] : currentObstacles()
      const prevBobPhase = player.bobPhase
      const trackPrevX = player.x
      const trackPrevZ = player.z
      player = stepPlayer(player, input, combinedGround, stepObstacles, speed)
      if (!worldStream) {
        player.x = Math.max(-halfSize, Math.min(halfSize, player.x))
        player.z = Math.max(-halfSize, Math.min(halfSize, player.z))
      }
      worldStream?.update(player.x, player.z)

      // In/near water keeps the old synthesized splash (audio/audio.ts's
      // footstep() — see FOOTSTEP_PARAMS.water) rather than the recorded
      // walk/run clip below: the recording was never meant to stand in for
      // that one.
      if (!isRiding() && crossedFootstep(prevBobPhase, player.bobPhase)) {
        const nearWater = (source.water ?? []).some(
          (ring) => distanceToRing(player.x, player.z, ring) < WATER_FOOTSTEP_RADIUS,
        )
        if (nearWater) audio.footstep(footstepSubstrate(biome, nearWater))
        else audio.footstepClip(input.sprinting)
        forest.layFootTrack(player.x, player.z, player.yaw, footSide(player.bobPhase))
      }

      // A bicycle leaves a continuous tyre track rather than a footstep-
      // cadenced pair — one mark roughly every BIKE_TRACK_SPACING metres
      // actually covered, the same "lay by distance, not by event" driftfx.ts
      // uses for skid marks.
      if (isRiding()) {
        bikeTrackAcc += Math.hypot(player.x - trackPrevX, player.z - trackPrevZ)
        while (bikeTrackAcc >= BIKE_TRACK_SPACING) {
          bikeTrackAcc -= BIKE_TRACK_SPACING
          forest.layBikeTrack(player.x, player.z, player.yaw)
        }
      }

      // Water ambience runs every frame, not on a timer — it is a
      // continuous loop whose only job is to track the player's own
      // distance to the nearest pond/stream edge.
      const nearestW = nearestWater(player.x, player.z, waterBodies)
      audio.updateWaterAmbience(
        nearestW ? waterAmbienceGain(nearestW.distance, WATER_AMBIENCE_RADIUS) : 0,
        nearestW?.kind ?? null,
      )

      // A tap stands for "aim at it and press E" in one motion — see
      // game/touchControls.ts's own doc comment for why a crosshair is not
      // the right aim model for a thumb.
      const tap = touch.consumeTap()
      if (tap) {
        const tapPoint = new THREE.Vector2(tap.x, tap.y)
        const target = nearestInView(camera, mushroomCandidates(), REACH, forest.occluders, tapPoint)
        // A tap that missed every mushroom still tries the quest item/scrub/
        // door — touch has no separate `E` to reach any of those otherwise.
        if (target) examineTarget(target)
        else if (!tryQuestInteract() && !tryDroneCrate() && !tryChopScrub(tapPoint) && nearDoor) forest.toggleShelterDoor()
      }
    }

    bobScale = easeToward(bobScale, isRiding() ? 0 : 1, dt, 8)
    const bob = cameraBob(player, bobScale)
    if (flight) {
      // The view from the quadcopter.
      camera.position.set(flight.x, flight.y, flight.z)
      camera.rotation.set(flight.pitch, flight.yaw, flight.roll, 'YXZ')
    } else {
      camera.position.set(
        player.x + Math.cos(player.yaw) * bob.dx,
        combinedGround.heightAt(player.x, player.z) + eyeHeight(player) + player.hop + player.stand + bob.dy,
        player.z - Math.sin(player.yaw) * bob.dx,
      )
      camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    }
    const viewYaw = flight ? flight.yaw : player.yaw
    compass.update(viewYaw)
    updateQuestHud()
    if (save.prefs.minimap) {
      const markers = buildMinimapMarkers(landmarks, quests, save.prefs.minimapQuestHints, QUEST_MARKER_COLOR)
      // The train, while it is out of its tunnels: where it is, and so where it is going.
      const loco = forest.trainLocomotive()
      if (loco) markers.push({ position: loco, color: TRAIN_MARKER_COLOR })
      minimap.setMarkers(markers)
      minimap.update({ x: focusX, z: focusZ, heading: headingFromYaw(viewYaw) })
    }
    if (save.prefs.timeMode === 'cycle') cycleT = (cycleT + dt / DAY_LENGTH_SECONDS) % 1
    const clockT = timeFor(save.prefs.timeMode, cycleT)
    forest.updateDayNight(clockT, camera.position)
    forest.updatePlayerLamp(
      lampIsOn(quests.lamp.state === 'done', nightFactor(clockT), forest.playerInsideMine(player.x, player.z), lampOn),
      camera.position,
    )
    const diamondMesh = questItemMeshes.diamond
    if (diamondMesh) {
      const lit = lampIsOn(
        quests.lamp.state === 'done', nightFactor(clockT), forest.playerInsideMine(player.x, player.z), lampOn,
      )
      const dist = diamondMesh.position.distanceTo(camera.position)
      // Fades in over the last 6m of the lamp's own reach, fully bright by
      // 1.5m — a glint you have to actually walk up to and be carrying a
      // lit lamp to see, matching the mine's own "genuinely dark otherwise"
      // rule (docs/superpowers/specs/2026-09-15-mine-cave-design.md §7).
      const closeness = lit ? Math.max(0, Math.min(1, (6 - dist) / (6 - 1.5))) : 0
      ;((diamondMesh as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = closeness * 1.8
    }
    const distToFire = Math.hypot(player.x - forest.campfire.x, player.z - forest.campfire.z)
    audio.updateMusic(nightFactor(clockT), campfireGain(distToFire, CAMPFIRE_MUSIC_RADIUS))
    forest.updateClouds(camera.position, dt)
    weatherClock += dt
    const weatherWanted = weatherNow(clockT)
    if (weatherWanted !== shownWeather) {
      shownWeather = weatherWanted
      forest.setWeather(shownWeather, false)
    }
    forest.updateWeather(camera.position, dt)
    forest.updateShelter(dt)
    forest.updateCampfire(dt)
    forest.updateBirds(dt, focusX, focusZ)
    forest.updateCritters(dt, focusX, focusZ)
    worldStream?.updateCritters(dt, focusX, focusZ)
    forest.updateInsects(dt)
    forest.updateTrain(dt)
    forest.updateWater(dt)
    forest.updateTracks(dt)
    if (flashlightOn) forest.updateFlashlight(camera.position, camera.getWorldDirection(camDir))

    cullDistantMushrooms()
    forest.updateMushroomLod(camera)
    worldStream?.updateLod(camera)
    if (++scatterCullFrame >= SCATTER_CULL_INTERVAL_FRAMES) {
      scatterCullFrame = 0
      forest.updateScatterCulling(focusX, focusZ, SCATTER_CULL_RADIUS)
      worldStream?.updateScatterCulling(focusX, focusZ, SCATTER_CULL_RADIUS)
    }
    // The train has arrived at the crate's end of the line: it leaves the crate.
    if (droneOrder?.stage === 'ordered') {
      const stopped = forest.trainStopped()
      if (stopped && stopped.end === droneOrder.crateEnd) {
        droneOrder = { ...droneOrder, stage: 'crate' }
        save = { ...save, drone: droneOrder }
        void persistSave(save)
        forest.setDroneCrate(droneOrder.crateEnd)
        toast(t('droneCrateArrived'))
      }
    }
    updateAim()
    updateDebugOverlay()
    bikeView.setVisible(isRiding() && !flight)
    // The front wheel rolls with the ground the player actually covers: blocked by
    // a trunk it stands still, backing up it turns the other way.
    bikeView.update(dt, player.yaw, camera, forwardSpeedOf(player.x - bikePrevX, player.z - bikePrevZ, player.yaw, dt))
    bikePrevX = player.x
    bikePrevZ = player.z
    renderer.render(forest.scene, camera)
    bikeView.render(renderer, camera)
    if (loadingOpen) {
      loadingOpen = false
      loading.close()
      backdrop?.stop()
    }

    // Boot-check needs only a handful of frames, and can't afford more: a few
    // rather than exactly one gives the compositor a chance to actually
    // present what was drawn before the loop stops.
    if (window.__BOOTCHECK && ++bootFrames >= 3) renderer.setAnimationLoop(null)
  })

  window.__READY = true
}

void main().catch((e) => console.error('itffm: failed to start', e))
