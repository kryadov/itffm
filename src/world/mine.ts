import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'

export interface Mine {
  x: number
  z: number
  /** Ground height at the entrance itself. */
  y: number
  /** Radians the tunnel bores away from the entrance, 0 along +x. */
  heading: number
}

/** Structurally identical to game/player.ts's Obstacle — see the same note in deadwood.ts. */
interface CircleObstacle {
  x: number
  z: number
  radius: number
}

/** Exported so `isInsideMine` (below) reuses the exact same tunnel size
 *  rather than a second, hand-picked "interior radius" constant. */
export const TUNNEL_LENGTH = 6
const TUNNEL_WIDTH = 2.2
const TUNNEL_HEIGHT = 2.3
const WALL_THICKNESS = 0.15

/** How far out, and how many directions, `placeMine` samples to find "into
 *  the hillside" — see its own doc comment for why this reads the terrain
 *  instead of a tag or a seed. */
const HEADING_SAMPLE_DIST = 8
const HEADING_CANDIDATES = 12

/** Spacing of the small circles standing in for the tunnel's real (thin,
 *  straight) walls in the player's own circle-based collision — the same
 *  technique `world/shelter.ts`'s `wallObstacles` uses, close enough
 *  together that a player's own radius can never slip between two. */
const WALL_CIRCLE_SPACING = 0.3
const WALL_CIRCLE_RADIUS = 0.16

/**
 * Where the wood's one mine/cave interior sits — one per real OSM
 * cave/adit/mineshaft mouth (`geo/parse.ts`'s `CaveEntrance`). Unlike the
 * shelter, there is no procedural fallback siting one in open woods: a
 * tunnel dug at an arbitrary point would not mean anything the way a hut in
 * a clearing does. A real entrance is what makes this honest, so it only
 * ever exists where one was actually surveyed.
 *
 * OSM never records which way a mapped entrance faces, so the heading is
 * read off the terrain itself rather than guessed or seeded: whichever of a
 * ring of candidate directions climbs the most over `HEADING_SAMPLE_DIST`
 * is treated as "into the hillside" — the same thing a real visitor would
 * look for.
 */
export function placeMine(entrance: Vec2, ground: ElevationProvider): Mine {
  const here = ground.heightAt(entrance.x, entrance.z)
  let bestHeading = 0
  let bestRise = -Infinity
  for (let i = 0; i < HEADING_CANDIDATES; i++) {
    const heading = (i / HEADING_CANDIDATES) * Math.PI * 2
    const sx = entrance.x + Math.cos(heading) * HEADING_SAMPLE_DIST
    const sz = entrance.z + Math.sin(heading) * HEADING_SAMPLE_DIST
    const rise = ground.heightAt(sx, sz) - here
    if (rise > bestRise) {
      bestRise = rise
      bestHeading = heading
    }
  }
  return { x: entrance.x, z: entrance.z, y: here, heading: bestHeading }
}

/**
 * Whether a point is close enough to this mine's entrance to count as
 * "inside" for the lamp's own on/off rule (`quest/lamp.ts`'s `lampIsOn`) — a
 * plain distance check against the tunnel's own length, not a precise
 * inside-the-box test: standing right at the mouth already counts, which is
 * the honest reading of "you're at the mine, it's dark in there."
 */
export function isInsideMine(m: Mine, x: number, z: number): boolean {
  return Math.hypot(x - m.x, z - m.z) <= TUNNEL_LENGTH
}

/** A point `lx` deep and `lz` across from the entrance, in world metres —
 *  shared by the collision (`mineObstacles`) and the mesh (`buildMineMesh`,
 *  via the same rotation applied to its whole group) so the two can never
 *  drift apart. */
function localToWorld(m: Mine, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(m.heading)
  const sin = Math.sin(m.heading)
  return { x: m.x + lx * cos - lz * sin, z: m.z + lx * sin + lz * cos }
}

/**
 * The tunnel's own collision: two side walls running its length, plus a
 * back wall closing the far end — a dead end, not a passage through to
 * somewhere else.
 */
export function mineObstacles(m: Mine): CircleObstacle[] {
  const half = TUNNEL_WIDTH / 2
  const out: CircleObstacle[] = []

  const sideSteps = Math.ceil(TUNNEL_LENGTH / WALL_CIRCLE_SPACING)
  for (let i = 0; i <= sideSteps; i++) {
    const lx = (i / sideSteps) * TUNNEL_LENGTH
    out.push({ ...localToWorld(m, lx, half), radius: WALL_CIRCLE_RADIUS })
    out.push({ ...localToWorld(m, lx, -half), radius: WALL_CIRCLE_RADIUS })
  }

  const backSteps = Math.ceil(TUNNEL_WIDTH / WALL_CIRCLE_SPACING)
  for (let i = 0; i <= backSteps; i++) {
    const lz = -half + (i / backSteps) * TUNNEL_WIDTH
    out.push({ ...localToWorld(m, TUNNEL_LENGTH, lz), radius: WALL_CIRCLE_RADIUS })
  }

  return out
}

/**
 * The tunnel's own geometry — floor, ceiling, two side walls, a back wall,
 * and a lantern (the same `PointLight` + small shadow map recipe as the
 * shelter's own hearth light, `world/shelter.ts`) so there is something to
 * actually see by once inside. Built in the group's own local space (its
 * length along local +x, its width along local z) and then rotated as one
 * piece by `m.heading` — the same convention `localToWorld` above works out
 * by hand for collision, so the mesh and the collision can never disagree.
 */
export function buildMineMesh(m: Mine): THREE.Group {
  const group = new THREE.Group()
  group.name = 'mine'
  group.position.set(m.x, m.y, m.z)
  group.rotation.y = -m.heading

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b564e, roughness: 1, flatShading: true })
  const half = TUNNEL_WIDTH / 2

  const floor = new THREE.Mesh(new THREE.BoxGeometry(TUNNEL_LENGTH, WALL_THICKNESS, TUNNEL_WIDTH), rockMat)
  floor.position.set(TUNNEL_LENGTH / 2, -WALL_THICKNESS / 2, 0)
  floor.receiveShadow = true
  group.add(floor)

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(TUNNEL_LENGTH, WALL_THICKNESS, TUNNEL_WIDTH), rockMat)
  ceiling.position.set(TUNNEL_LENGTH / 2, TUNNEL_HEIGHT + WALL_THICKNESS / 2, 0)
  group.add(ceiling)

  const sideGeom = new THREE.BoxGeometry(TUNNEL_LENGTH, TUNNEL_HEIGHT, WALL_THICKNESS)
  const wallL = new THREE.Mesh(sideGeom, rockMat)
  wallL.position.set(TUNNEL_LENGTH / 2, TUNNEL_HEIGHT / 2, half)
  group.add(wallL)
  const wallR = new THREE.Mesh(sideGeom, rockMat)
  wallR.position.set(TUNNEL_LENGTH / 2, TUNNEL_HEIGHT / 2, -half)
  group.add(wallR)

  const back = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, TUNNEL_HEIGHT, TUNNEL_WIDTH), rockMat)
  back.position.set(TUNNEL_LENGTH, TUNNEL_HEIGHT / 2, 0)
  group.add(back)

  // A lantern near the back, not the mouth, but deliberately dim — a mine
  // without the lamp quest owned has to read as genuinely dark regardless of
  // time of day (see docs/superpowers/specs/2026-09-13-quest-items-design.md),
  // so this is barely more than a glint on the rock rather than the earlier,
  // brighter fixture that lit the whole tunnel by itself. What actually lights
  // the interior once the player has reason to see is the lamp quest's own
  // PointLight on the player (game/scene.ts's `updatePlayerLamp`), not this.
  const lantern = new THREE.PointLight(0xffb15c, 0.5, 4)
  lantern.position.set(TUNNEL_LENGTH * 0.75, TUNNEL_HEIGHT * 0.6, 0)
  lantern.castShadow = true
  lantern.shadow.mapSize.set(256, 256)
  lantern.shadow.bias = -0.002
  group.add(lantern)

  return group
}
