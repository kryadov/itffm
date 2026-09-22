import * as THREE from 'three'
import { createForest } from '../game/scene'
import { loadForestData } from '../game/loadForest'
import { attractOrbitPose } from '../game/attractCamera'
import { buildWavingFigure } from '../world/pilotFigure'
import { DAY_TIME } from '../world/daynight'
import { yieldToPaint } from '../util/yield'

/**
 * The start screen's own live backdrop: the real offline demo wood, actually
 * built and simulated (not a video, not a separate cut-down scene), with a
 * quadcopter's own slow circle around the home plot instead of a player — the
 * train runs, wildlife moves, and a figure by the shelter waves — while the
 * place picker (and, after a pick, the loading screen) sits over it. The same
 * idea as `race-the-city`'s own "attract mode": the real thing running behind
 * the menu, not a poster of it.
 *
 * Deliberately its own throwaway `WebGLRenderer` and `Forest`, never handed
 * off into the real game even if the player ends up choosing the demo wood
 * too — `game/scene.ts`'s `Forest` has no `dispose()` to hand a live one
 * back cleanly, and main.ts's own loading path is exactly as fast either way
 * (this file's `Forest` and its own are never the same object). Once
 * `stop()`s called, dropping every reference and disposing the renderer is
 * enough to let the browser reclaim the GPU context — there is nothing here
 * (or anywhere else `Forest` is used) that manually frees geometries either.
 */

/** Distance from the home plot's own centre the camera circles at, metres —
 *  the demo wood's plot is 400 m across (`world/chunking.ts`'s `CHUNK_SIZE`),
 *  and the railway's two stations sit well over 100 m out from the middle of
 *  it, so the loop has to be wide enough to catch the line and a train on it,
 *  not just the clearing right around the shelter. */
const ORBIT_RADIUS = 100
/** How high above the plot centre's own ground the camera flies, metres —
 *  clear of the tallest genus's tallest crown (world/trees.ts's LOOK table
 *  tops out at 32 m for abies/pinus) with real margin, and high enough that
 *  a 100 m-radius circle around the middle of the plot still fits the frame. */
const ORBIT_HEIGHT = 90
/** How high above the plot centre's own ground the camera looks, metres —
 *  the canopy's own rough height, so the shot reads as across the wood, not
 *  straight down into it. */
const ORBIT_LOOK_HEIGHT = 20
/** Radians a second — a slow drift; one full turn in about four minutes, the
 *  same unhurried pace a real estate flyover uses. */
const ORBIT_SPEED = (2 * Math.PI) / 240
/** How far from the shelter the waving figure stands, metres, so it reads
 *  as someone waiting outside rather than standing in the doorway. */
const FIGURE_OFFSET = { x: 3.5, z: 2.5 }
/** Same budget main.ts's own mushroom-growing slices use (see GROW_SLICE_MS) —
 *  short enough that the place picker never freezes while this loads. */
const GROW_SLICE_MS = 30
/** The wood's own walking-eye-height fog (`game/scene.ts`'s `Fog(...,30,140)`)
 *  fades anything past 140 m to flat fog colour — right, seen from a metre
 *  or two off the ground, but it would swallow the far station and half the
 *  railway from this camera's own wider, higher vantage. This scene is never
 *  the real game's own (a fresh, throwaway `Forest` — see the module doc
 *  comment), so widening its fog here changes nothing anyone actually plays in. */
const FOG_NEAR = 60
const FOG_FAR = 340
/** Seconds to run the train forward before the loop starts, so the backdrop
 *  never opens on the exact same idle dwell at a platform every time. */
const TRAIN_HEAD_START = 45

export interface AttractBackdrop {
  /** Starts loading the demo wood in the background and, once it's ready,
   *  renders it behind whatever already sits in front of `root` — safe to
   *  call once. */
  start(): void
  /** Tears the whole thing down: safe to call at any point, including
   *  before `start()`'s own load has finished, or more than once. */
  stop(): void
}

/** @param root where the backdrop's own canvas is appended — main.ts's `#app`,
 *  the same element the real game's canvas already sits in (appended after
 *  it, so it draws on top while the real one is still blank). */
export function createAttractBackdrop(root: HTMLElement): AttractBackdrop {
  let stopped = false
  let renderer: THREE.WebGLRenderer | null = null
  let onResize: (() => void) | null = null

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block'
  root.appendChild(canvas)

  const stop = (): void => {
    if (stopped) return
    stopped = true
    renderer?.setAnimationLoop(null)
    renderer?.dispose()
    if (onResize) removeEventListener('resize', onResize)
    canvas.remove()
  }

  const start = (): void => {
    void (async () => {
      const { source, seed, halfSize, groundSegments } = await loadForestData(null, () => {})
      if (stopped) return
      const forest = createForest(source, seed, halfSize, groundSegments, 0, true)
      while (!stopped && forest.buildPlacements(GROW_SLICE_MS) > 0) await yieldToPaint()
      if (stopped) return

      const figure = buildWavingFigure()
      const fx = forest.shelter.x + FIGURE_OFFSET.x
      const fz = forest.shelter.z + FIGURE_OFFSET.z
      figure.group.position.set(fx, forest.ground.heightAt(fx, fz), fz)
      figure.group.rotation.y = Math.atan2(forest.shelter.x - fx, forest.shelter.z - fz) + Math.PI
      forest.scene.add(figure.group)

      if (forest.scene.fog instanceof THREE.Fog) {
        forest.scene.fog.near = FOG_NEAR
        forest.scene.fog.far = FOG_FAR
      }
      for (let i = 0; i < TRAIN_HEAD_START; i++) forest.updateTrain(1)

      renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000)
      onResize = () => {
        renderer!.setSize(innerWidth, innerHeight)
        camera.aspect = innerWidth / innerHeight
        camera.updateProjectionMatrix()
      }
      onResize()
      addEventListener('resize', onResize)

      // The plot's own centre (the reserved chunk (0, 0) — world/chunking.ts),
      // not the shelter: the shelter sits off to one side of it, and centring
      // the loop there would put the railway (and any train on it) outside
      // even a 100 m-radius circle around it.
      const centerX = 0
      const centerZ = 0
      // The orbit's own height/look-height are above the plot centre's own
      // ground, not absolute world Y — a hillside wood would otherwise fly
      // the camera through the canopy or into the hill depending which way
      // the terrain happened to slope from world origin.
      const groundY = forest.ground.heightAt(centerX, centerZ)
      const lookAt = new THREE.Vector3()
      let t = 0
      let last = performance.now()

      renderer.setAnimationLoop(() => {
        const now = performance.now()
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        t += dt

        const pose = attractOrbitPose(
          t, centerX, centerZ, ORBIT_RADIUS, groundY + ORBIT_HEIGHT, groundY + ORBIT_LOOK_HEIGHT, ORBIT_SPEED,
        )
        camera.position.set(pose.x, pose.y, pose.z)
        lookAt.set(pose.lookX, pose.lookY, pose.lookZ)
        camera.lookAt(lookAt)

        forest.updateDayNight(DAY_TIME, camera.position)
        forest.updateClouds(camera.position, dt)
        forest.updateCritters(dt, centerX, centerZ)
        forest.updateInsects(dt)
        forest.updateTrain(dt)
        forest.updateWater(dt)
        forest.updateShelter(dt)
        forest.updateCampfire(dt)
        forest.updateMushroomLod(camera)
        figure.wave(t)

        renderer!.render(forest.scene, camera)
      })
    })()
  }

  return { start, stop }
}
