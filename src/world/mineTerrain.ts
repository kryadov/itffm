import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'
import { TUNNEL_HEIGHT, caveSdf, localToWorld, worldToLocal, type Mine } from './mine'

/**
 * How the hillside is dressed around the mine, and what the player stands on.
 *
 * The ground is one heightfield: it cannot have a tunnel in it, only a
 * surface above. The first version buried the tunnels 5-7 m under it and let
 * the terrain mesh cover the mouth — the entrance was invisible, and from
 * inside the (single-sided) terrain showed the sky. The mine is now dressed
 * three ways, all read from one description so the mesh, the player and the
 * camera agree:
 *
 *  1. An APRON in front of the mouth: the ground is levelled to the floor
 *     height, so the doorway opens onto flat, walkable ground and is never
 *     buried by a slope.
 *  2. A MOUND over the tunnels (the "deck"): behind the doorway the surface is
 *     lifted to at least `COVER` above the tunnel roof, so the ground above
 *     the tunnels is the hill the tunnels are dug into — a rock face with a
 *     doorway in it where the mound meets the apron. Where the real hillside
 *     is already higher, the deck simply follows it.
 *  3. The terrain mesh itself is dropped below the floor wherever a triangle
 *     could reach into a passage (`meshGround`), because the mound is drawn as
 *     its own mesh (`mineMesh.ts`) and the ground would otherwise poke its
 *     grass up through the floor of the tunnel.
 *
 * The x/z of the hill above a tunnel is the x/z of the tunnel, so "the height
 * at this point" is ambiguous on its own. The player's height therefore also
 * depends on whether they are inside (`MineContext`, kept by `update`): inside,
 * everything near the passages is floor; outside it is the hill. The tunnel
 * collision (mine.ts) makes the switch unreachable except through the doorway.
 */

/** Rock left above the tunnel roof, metres — the lintel over the doorway. */
const COVER = 0.9
/** The mound is never lower than this above the natural ground within its
 *  footprint, metres, so the deck always sits proud of the grass under it. */
const LIP = 0.05
/** Grade of the mound's flank (rise over run). Steeper than the player's own
 *  slope limit (game/player.ts SLOPE_BLOCK, 1.4 — and a metre-long probe
 *  averages a foot or crest into it), even against a rising hillside: the
 *  mound is a rock outcrop you walk round, never a hill you can climb onto. */
const FLANK = 1.7
/** How much higher than its cover needs the mound's crest may rise, metres —
 *  an uneven skyline rather than one long level wall (a live report,
 *  2026-09-24). Only ever added: the cover over the tunnels stays. */
const CREST_RISE = 1.8
/** How far past each doorway jamb the mound's front stands as a sheer rock
 *  face, metres; beyond it (over a short shoulder) the front slopes down like
 *  the flanks, so the outcrop has a face round its door, not a wall the
 *  width of the whole maze (a live report, 2026-09-24). */
const FACE_SHOULDER = 2.8
const SHOULDER_BLEND = 2.2
/** The mound is at least this tall above the natural ground under it, metres,
 *  even where the real hillside already stands above the tunnel roof — a low
 *  curb would be a step the player could simply walk up onto. */
const MIN_HEIGHT = 2.4
/** The apron sits this far under the floor height, metres (the floor mesh has
 *  its own small lift — see FLOOR_LIFT in mine.ts). */
const APRON_SINK = 0.02
/** How far in front of the doorway the apron is dead level, and how long it
 *  then takes to give way to the natural ground, metres. Level only for a
 *  short step: a long pad cut into a slope leaves a bank steeper than the hill
 *  it was cut from, and the player's own slope limit refuses steep banks. The
 *  fade starts where the fill is still small and is long enough that it never
 *  adds more than a modest grade to the natural one. */
const APRON_FLAT = 1
const APRON_FADE = 9
/** How far under the mound's surface the terrain mesh sits, metres. */
const UNDER_MOUND = 0.4
/** How far under the floor the terrain mesh is dropped where it could reach a
 *  passage, metres. */
const MESH_DROP = 0.6
/** Distance the player still counts as "in the tunnel" for the height under
 *  the slope probe (`game/player.ts` samples a metre ahead), metres. */
const PROBE = 1.3
/** The doorway's own threshold: outside, the floor height still holds this far
 *  in, so walking through the mouth never meets the mound. */
const THRESHOLD = 2
/** How far in front of the doorway counts as the doorstep, metres. */
const DOORSTEP = 4

/** Mutable "the player is in the tunnels" flag. */
export interface MineContext {
  inside: boolean
  /** The player has come up to the doorway from the apron in front of it, so
   *  the floor height already holds a couple of metres in. Someone who is over
   *  the tunnel by any other way (standing on the outcrop) is not at the door,
   *  and stands on the rock they are on. */
  atDoor: boolean
}

export interface MineTerrain {
  /** What the player and camera stand on. Depends on `ctx`. */
  surface: ElevationProvider
  /** The same surface as if the player were outside, whatever the flag says:
   *  what things laid on the hill (mushrooms, animals) stand on, which must not
   *  change with where the player happens to be. */
  outsideSurface: ElevationProvider
  /** What the terrain mesh is built from. */
  meshGround: ElevationProvider
  /** Height of the mound at a local point (absolute world y), ignoring
   *  whether the player is inside. Equals the natural ground outside the
   *  mound's footprint. */
  deckAt(lx: number, lz: number): number
  /** Height of the levelled apron at a local point in front of the doorway
   *  (lx < 0). */
  apronAt(lx: number, lz: number): number
  /** Distance from the tunnel outline out to which the mound reaches. */
  deckRadius: number
  /** Whether a world point lies on the mound, the rock face or the doorstep —
   *  the ground a trail ribbon or anything else laid on the meadow must keep
   *  off. `margin` widens it, metres. */
  occupies(x: number, z: number, margin?: number): boolean
  /** Whether a world point lies on the mound or its rock face (not the
   *  apron in front): where a trail must stop. */
  onMound(x: number, z: number, margin?: number): boolean
  ctx: MineContext
  /** Feed the player's position each frame; returns whether they are inside. */
  update(x: number, z: number): boolean
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * @param cell the terrain mesh's cell size, metres — how far a mesh triangle
 *   can reach past a vertex decides how much of the ground has to be dropped
 *   (and how wide the mound has to be to hide the drop).
 */
export function createMineTerrain(m: Mine, base: ElevationProvider, cell: number): MineTerrain {
  const half = m.segments[0].width / 2
  const lowered = 1.5 * cell
  const deckRadius = 3.6 * cell + 0.5
  const floorY = m.y
  const apronY = floorY - APRON_SINK
  const roofTop = floorY + TUNNEL_HEIGHT + COVER
  const noiseSeed = (Math.round(m.x * 7) ^ Math.round(m.z * 13)) & 0xffff
  const ctx: MineContext = { inside: false, atDoor: false }

  const baseAt = (lx: number, lz: number): number => {
    const w = localToWorld(m, lx, lz)
    return base.heightAt(w.x, w.z)
  }

  const apronAt = (lx: number, lz: number): number => {
    const side = 1 - smoothstep(half + lowered, half + lowered + 3, Math.abs(lz))
    const front = 1 - smoothstep(APRON_FLAT, APRON_FLAT + APRON_FADE, -lx)
    const w = side * front
    const b = baseAt(lx, lz)
    return b + (apronY - b) * w
  }

  const deckAt = (lx: number, lz: number): number => {
    const b = baseAt(lx, lz)
    if (lx < 0) return apronAt(lx, lz)
    const dOut = Math.max(0, caveSdf(m, lx, lz))
    const height = LIP + Math.max(roofTop - b, MIN_HEIGHT)
    // A straight flank at FLANK from the rim up to the crest, its edge just
    // rounded: the width it needs follows from how tall the mound is here.
    const t = (deckRadius - dOut) / (height / FLANK)
    if (t <= 0) return b
    const shape = (u: number): number => (u >= 1 ? 1 : u > 0.8 ? 1 - 1.25 * (1 - u) * (1 - u) : Math.max(0, u))
    let s = shape(t)
    // Away from the doorway the front slopes back from the apron like a flank.
    const away = smoothstep(half + FACE_SHOULDER, half + FACE_SHOULDER + SHOULDER_BLEND, Math.abs(lz))
    if (away > 0) s = Math.min(s, s * (1 - away) + shape((lx * FLANK) / height) * away)
    if (s <= 0) return b
    const noise = fbm2(lx / 3, lz / 3, noiseSeed, 2) * 0.12
    const rise = Math.max(0, fbm2(lx / 7, lz / 7, noiseSeed + 11, 3) + 0.25) * CREST_RISE
    return b + (height + noise + rise) * s
  }

  const surfaceLocal = (lx: number, lz: number, inside: boolean): number => {
    if (lx < 0) return apronAt(lx, lz)
    const sdf = caveSdf(m, lx, lz)
    if (inside) return sdf < PROBE ? floorY : deckAt(lx, lz)
    return sdf < 0 && lx <= THRESHOLD && ctx.atDoor ? floorY : deckAt(lx, lz)
  }

  const meshLocal = (lx: number, lz: number): number => {
    if (lx < 0) return apronAt(lx, lz)
    // Under the mound's front edge the mesh stays with the apron, however far
    // out to the side: were it to climb to the mound's height here, the
    // triangles between the last vertex in front of the face and the first
    // behind it would stand up as a green wedge against the rock.
    if (lx < lowered) return apronAt(-1e-6, lz)
    const dOut = Math.max(0, caveSdf(m, lx, lz))
    // The mound is drawn as its own, finer mesh; under it the terrain mesh sits
    // a little lower wherever the mound has risen, or its coarser triangles
    // poke through the mound's surface as green patches. The drop fades to
    // nothing at the mound's rim, where the two meet.
    const d = deckAt(lx, lz)
    const risen = Math.max(0, d - baseAt(lx, lz))
    const under = d - UNDER_MOUND * Math.min(1, risen / 0.5)
    return dOut <= lowered ? Math.min(under, floorY - MESH_DROP) : under
  }

  return {
    surface: {
      heightAt: (x, z) => {
        const { lx, lz } = worldToLocal(m, x, z)
        return surfaceLocal(lx, lz, ctx.inside)
      },
    },
    outsideSurface: {
      heightAt: (x, z) => {
        const { lx, lz } = worldToLocal(m, x, z)
        return surfaceLocal(lx, lz, false)
      },
    },
    meshGround: {
      heightAt: (x, z) => {
        const { lx, lz } = worldToLocal(m, x, z)
        return meshLocal(lx, lz)
      },
    },
    deckAt,
    apronAt,
    deckRadius,
    occupies(x, z, margin = 0) {
      const { lx, lz } = worldToLocal(m, x, z)
      if (lx < 0) return lx >= -(APRON_FLAT + 4) - margin && Math.abs(lz) <= half + deckRadius + margin
      return caveSdf(m, lx, lz) < deckRadius + margin
    },
    onMound(x, z, margin = 0) {
      const { lx, lz } = worldToLocal(m, x, z)
      if (lx < -margin) return false
      if (lx < 0) return Math.abs(lz) <= half + deckRadius + margin
      return caveSdf(m, lx, lz) < deckRadius + margin
    },
    ctx,
    update(x, z) {
      const { lx, lz } = worldToLocal(m, x, z)
      const sdf = caveSdf(m, lx, lz)
      if (!ctx.inside) {
        if (lx >= 0 && lx <= 1.6 && sdf < -0.2 && ctx.atDoor) ctx.inside = true
      } else if (lx < -0.3 || sdf > 2.5) {
        ctx.inside = false
      }
      // The doorstep: the apron in front of the doorway and the first metres
      // past it, entered from the front only.
      if (ctx.inside) ctx.atDoor = false
      else if (lx > THRESHOLD) ctx.atDoor = false
      else if (lx >= -DOORSTEP && lx <= 0.5 && Math.abs(lz) <= half + 1) ctx.atDoor = true
      return ctx.inside
    },
  }
}
