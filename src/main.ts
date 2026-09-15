import * as THREE from 'three'
import { createForest } from './game/scene'
import { createWorldStream } from './game/worldStream'
import { DEFAULT_WORLD_SIZE } from './ui/worldSize'
import { loadForestData, type LoadStage } from './game/loadForest'
import { createControls } from './game/controls'
import { createTouchControls } from './game/touchControls'
import { AudioEngine } from './audio/audio'
import { crossedFootstep, footstepSubstrate } from './audio/footsteps'
import { nearestWater, waterAmbienceGain, type WaterBody } from './audio/waterAmbience'
import { campfireGain } from './audio/musicAmbience'
import { classifyWater } from './world/water'
import { distanceToRing } from './util/geometry'
import {
  stepPlayer, eyeHeight, cameraBob, biomeSpeedFactor, bikeSpeedFactor, type PlayerState, type Obstacle,
} from './game/player'
import { distanceToNearestPath, HALF_WIDTH as PATH_HALF_WIDTH } from './world/paths'
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
import { renderCollectiblePreview } from './ui/preview'
import { openSettingsMenu } from './ui/settingsMenu'
import { timeFor, nightFactor, DAY_TIME } from './world/daynight'
import { gameDaysElapsed, realMonthAt, DAYS_PER_MONTH } from './world/calendar'
import { speciesById, loadSpecies } from './species/load'
import { HITBOX_RADIUS } from './collectible/build'
import { DOOR_INTERACT_RADIUS } from './world/shelter'
import { emptySave, loadSave, persistSave, applyFind, setFindNote, type SaveData } from './save/store'
import { setLang, getLang, t, speciesName } from './i18n/i18n'
import { placeQuestItems, type QuestObstacle } from './quest/placement'
import { tryPickUp, tryDeliver } from './quest/state'
import { QUEST_ITEM_IDS, type QuestItemId, type Quests } from './quest/types'
import { chopScrub } from './quest/scrub'
import { lampIsOn } from './quest/lamp'
import { buildScrubMesh } from './world/scrub'
import { jitterDiamondGeometry, DIAMOND_GEM_SEED } from './world/diamondGem'

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
/** One colour per quest item, so the four standalone pickup meshes read as
 *  different things at a glance even though v1 gives none of them a real
 *  carried-item model (see the fetch-quest design doc's "no carried-item
 *  mesh in hand for v1" — still true here, just four colours instead of one). */
const QUEST_ITEM_COLOR: Record<QuestItemId, number> = {
  axe: 0x8a8a92,
  lamp: 0xd8a04a,
  rod: 0x5a4a30,
  bike: 0x3f6db0,
  diamond: 0xbfe8ff,
}
/** Fixed landmark colors — shelter keeps the minimap's original amber
 *  unchanged, mine and campfire get their own so the three are never
 *  confused for each other or for a quest-item hint. */
const LANDMARK_COLOR = { shelter: '#d8a04a', mine: '#6f7f8f', campfire: '#e2564a' }
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
  loading.close()

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
  const forest = createForest(source, seed, halfSize, groundSegments, gameDays)
  forest.setWeather(save.prefs.weather)
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
  minimap.setWorld(source.paths ?? [], source.water ?? [], halfSize)
  minimap.setVisible(save.prefs.minimap)
  // Fixed geography, sited once at load — same three points every session,
  // unlike the quest items' own positions below.
  const landmarks: Landmark[] = [
    { position: forest.shelter, color: LANDMARK_COLOR.shelter },
    { position: forest.mine, color: LANDMARK_COLOR.mine },
    { position: forest.campfire, color: LANDMARK_COLOR.campfire },
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
  let aimed: THREE.Object3D | null = null
  // Whether the player is close enough to the shelter's own doorway for `E`
  // to open/close it instead of examining an aimed mushroom — a plain
  // distance check (game/pick.ts's crosshair raycast is for a mushroom you
  // aim at; a doorway is a fixed, room-sized target you just walk up to).
  let nearDoor = false

  // Each quest item itself: a simple standalone mesh (no carried-item mesh
  // in hand for v1, per the design doc) that sits at its own position while
  // `pending` and disappears the instant it's picked up — cosmetic, not the
  // objective's own state, which lives in `quests` above.
  const questItemGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.32, 10)
  const questItemMeshes = {} as Record<QuestItemId, THREE.Mesh | null>
  function showQuestItem(id: QuestItemId): void {
    const isDiamond = id === 'diamond'
    const mesh = new THREE.Mesh(
      isDiamond ? DIAMOND_GEO : questItemGeo,
      new THREE.MeshStandardMaterial({
        color: QUEST_ITEM_COLOR[id],
        roughness: isDiamond ? 0.05 : 1,
        metalness: isDiamond ? 0.1 : 0,
        // Starts dark — updated every frame in the animation loop below,
        // once the player's lamp is close enough and lit to matter (see
        // docs/superpowers/specs/2026-09-15-mine-cave-design.md §7).
        emissive: isDiamond ? new THREE.Color(0x8fd8ff) : undefined,
        emissiveIntensity: 0,
      }),
    )
    const pos = quests[id].position
    mesh.position.set(pos.x, pos.y + (isDiamond ? 0.2 : 0.16), pos.z)
    forest.scene.add(mesh)
    questItemMeshes[id] = mesh
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
    diamond: forest.setDiamondPlaced,
    rod: forest.setRodPlaced,
    bike: forest.setBikePlaced,
  }
  for (const id of QUEST_ITEM_IDS) {
    if (quests[id].state === 'pending') showQuestItem(id)
    if (quests[id].state === 'done') TROPHY_SETTER[id]?.(true)
  }

  /**
   * Tries both quest transitions, for every item at once, at the player's
   * current position — a no-op for an item unless it is actually in the
   * matching state and range (see quest/state.ts's own doc comments), so
   * calling both unconditionally for all four is safe and mirrors the
   * shelter door's own "just walk up and press E" feel. Returns whether
   * anything actually happened, so the caller (the `E` keydown handler and
   * the touch tap handler) knows whether to fall through to the door check /
   * mushroom examination instead.
   */
  function tryQuestInteract(): boolean {
    let changed = false
    for (const id of QUEST_ITEM_IDS) {
      const before = quests[id].state
      quests[id] = tryPickUp(quests[id], player, DOOR_INTERACT_RADIUS)
      quests[id] = tryDeliver(quests[id], player, forest.shelterDoor, DOOR_INTERACT_RADIUS)
      if (quests[id].state === before) continue
      changed = true
      if (before === 'pending') hideQuestItem(id)
      if (quests[id].state === 'done') {
        toast(t(QUEST_COMPLETE_KEY[id]))
        TROPHY_SETTER[id]?.(true)
      }
    }
    if (!changed) return false
    save = { ...save, quests }
    void persistSave(save)
    return true
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
    // No mushroom in the crosshair — check for a quest item within pickup
    // range next (tryQuestInteract's own `tryPickUp` uses this same radius,
    // by plain distance rather than aim, so the hint has to use it too or
    // it would show up too early/late compared to when `E` actually works).
    for (const id of QUEST_ITEM_IDS) {
      if (quests[id].state !== 'pending') continue
      const pos = quests[id].position
      if (Math.hypot(player.x - pos.x, player.z - pos.z) >= DOOR_INTERACT_RADIUS) continue
      nearDoor = false
      hud.setTarget(t(QUEST_ITEM_NAME_KEY[id]))
      return
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
    // The rod's own gate: a fish is visible and aimable before the rod quest
    // is delivered, but pressing E on one does nothing until then.
    if (!canPick(species, quests.rod.state === 'done')) return

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
    if (e.code === 'KeyE') {
      if (tryQuestInteract()) {
        // handled: picked up or delivered a quest item
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
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // While an overlay is up the player stands still: the mouse/thumb belongs to it.
    if (!modalOpen()) {
      const inHome = Math.abs(player.x) <= halfSize && Math.abs(player.z) <= halfSize
      const biome = inHome ? source.biomeAt(player.x, player.z) : 'forest-mixed'
      const bike = bikeSpeedFactor(
        quests.bike.state === 'done', distanceToNearestPath(player, source.paths ?? []), PATH_HALF_WIDTH,
      )
      const speed = save.prefs.walkSpeedMultiplier * biomeSpeedFactor(biome) * bike
      const input = touch.active ? touch.read(dt) : controls.read(dt)
      const stepObstacles = worldStream ? [...currentObstacles(), ...worldStream.obstacles()] : currentObstacles()
      const prevBobPhase = player.bobPhase
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
      if (crossedFootstep(prevBobPhase, player.bobPhase)) {
        const nearWater = (source.water ?? []).some(
          (ring) => distanceToRing(player.x, player.z, ring) < WATER_FOOTSTEP_RADIUS,
        )
        if (nearWater) audio.footstep(footstepSubstrate(biome, nearWater))
        else audio.footstepClip(input.sprinting)
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
        else if (!tryQuestInteract() && !tryChopScrub(tapPoint) && nearDoor) forest.toggleShelterDoor()
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
    updateQuestHud()
    if (save.prefs.minimap) {
      minimap.setMarkers(buildMinimapMarkers(landmarks, quests, save.prefs.minimapQuestHints, QUEST_MARKER_COLOR))
      minimap.update({ x: player.x, z: player.z, heading: headingFromYaw(player.yaw) })
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
      ;(diamondMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = closeness * 1.8
    }
    const distToFire = Math.hypot(player.x - forest.campfire.x, player.z - forest.campfire.z)
    audio.updateMusic(nightFactor(clockT), campfireGain(distToFire, CAMPFIRE_MUSIC_RADIUS))
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
    if (++scatterCullFrame >= SCATTER_CULL_INTERVAL_FRAMES) {
      scatterCullFrame = 0
      forest.updateScatterCulling(player.x, player.z, SCATTER_CULL_RADIUS)
      worldStream?.updateScatterCulling(player.x, player.z, SCATTER_CULL_RADIUS)
    }
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
