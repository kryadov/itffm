import type { Vec2 } from '../geo/types'

const SIZE = 172
const OS_SCALE = 0.5
/** World metres from centre to the map's edge — fixed, no zoom control: one
 *  less knob for a feature that is itself already opt-in. */
const VIEW_RADIUS = 130

/** World point → pixel in the pre-rendered north-up offscreen map. Pure/testable. */
export function regionToOffscreen(v: Vec2, radius: number): { x: number; y: number } {
  return { x: (v.x + radius) * OS_SCALE, y: (v.z + radius) * OS_SCALE }
}

/**
 * `player.yaw` (game/player.ts) and the "heading" this map's rotation math
 * expects are not the same angle — `yaw` is a turn amount with its own
 * sign convention (see ui/compass.ts's `bearingDegrees`, which exists for
 * exactly this reason), while the map wants the standard math angle
 * (atan2) of the player's own forward direction. Converting once here
 * keeps that reasoning in one place instead of copied into every caller.
 */
export function headingFromYaw(yaw: number): number {
  return Math.atan2(-Math.cos(yaw), -Math.sin(yaw))
}

export interface Minimap {
  setWorld(paths: Vec2[][], water: Vec2[][], shelter: Vec2, halfSize: number): void
  update(player: { x: number; z: number; heading: number }): void
  setVisible(v: boolean): void
  dispose(): void
}

/**
 * A rotating radar-style minimap, ported from race-the-city's
 * `ui/minimap.ts`: trails and water are drawn once to a north-up offscreen
 * canvas, then each frame redrawn rotated and centred so the player always
 * points up. The city version's roads/buildings/goal-gate concepts don't
 * exist here — trails and ponds are what a real wood actually has, and the
 * one landmark worth marking is the shelter, not a quest target.
 *
 * Off by default (see ui/compass.ts): a map that shows where you are kills
 * half the point of a walk in the woods. This is an opt-in in settings for
 * players who want it, and it never marks a single mushroom — only the
 * ground itself.
 */
export function createMinimap(root: HTMLElement): Minimap {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.style.cssText =
    `position:fixed;top:16px;left:16px;width:${SIZE}px;height:${SIZE}px;` +
    'border-radius:50%;pointer-events:none;background:rgba(15,19,14,.6);box-shadow:0 4px 16px rgba(0,0,0,.4)'
  canvas.hidden = true
  root.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  let offscreen: HTMLCanvasElement | null = null
  let radiusM = 90
  let shelterPoint: Vec2 = { x: 0, z: 0 }

  function trace(g: CanvasRenderingContext2D, pts: Vec2[]): void {
    const p0 = regionToOffscreen(pts[0], radiusM)
    g.moveTo(p0.x, p0.y)
    for (let i = 1; i < pts.length; i++) {
      const p = regionToOffscreen(pts[i], radiusM)
      g.lineTo(p.x, p.y)
    }
  }

  const api: Minimap = {
    setWorld(paths, water, shelter, halfSize) {
      radiusM = halfSize
      shelterPoint = shelter
      const dim = Math.max(1, Math.round(2 * halfSize * OS_SCALE))
      const os = document.createElement('canvas')
      os.width = dim
      os.height = dim
      const g = os.getContext('2d')!

      g.fillStyle = 'rgba(47,109,176,.55)'
      for (const wp of water) {
        if (wp.length < 3) continue
        g.beginPath()
        trace(g, wp)
        g.closePath()
        g.fill()
      }

      g.strokeStyle = 'rgba(215,200,170,.8)'
      g.lineWidth = 1.5
      g.lineJoin = 'round'
      for (const path of paths) {
        if (path.length < 2) continue
        g.beginPath()
        trace(g, path)
        g.stroke()
      }
      offscreen = os
    },

    update(player) {
      const half = SIZE / 2
      ctx.clearRect(0, 0, SIZE, SIZE)
      if (offscreen) {
        const disp = half / (VIEW_RADIUS * OS_SCALE)
        const playerOff = regionToOffscreen({ x: player.x, z: player.z }, radiusM)
        ctx.save()
        ctx.beginPath()
        ctx.arc(half, half, half, 0, Math.PI * 2)
        ctx.clip()
        ctx.translate(half, half)
        ctx.rotate(-Math.PI / 2 - player.heading)
        ctx.scale(disp, disp)
        ctx.translate(-playerOff.x, -playerOff.y)
        ctx.drawImage(offscreen, 0, 0)
        ctx.restore()
      }

      // The shelter: bearing relative to the player's own heading, with up
      // being straight ahead — the one landmark this map admits to, same as
      // a real forager would remember where their hut sits.
      {
        const dx = shelterPoint.x - player.x
        const dz = shelterPoint.z - player.z
        const dist = Math.hypot(dx, dz)
        const rel = Math.atan2(dz, dx) - player.heading
        const disp = half / VIEW_RADIUS
        let sx = Math.sin(rel) * dist * disp
        let sy = -Math.cos(rel) * dist * disp
        const r = Math.hypot(sx, sy)
        const edge = half - 10
        if (r > edge && r > 1e-6) {
          sx = (sx / r) * edge
          sy = (sy / r) * edge
        }
        ctx.save()
        ctx.translate(half + sx, half + sy)
        ctx.fillStyle = '#d8a04a'
        ctx.strokeStyle = 'rgba(0,0,0,.6)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(0, 0, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }

      // Player marker at centre, pointing up.
      ctx.save()
      ctx.translate(half, half)
      ctx.fillStyle = '#eee'
      ctx.beginPath()
      ctx.moveTo(0, -7)
      ctx.lineTo(5, 6)
      ctx.lineTo(-5, 6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      ctx.strokeStyle = 'rgba(255,255,255,.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(half, half, half - 1, 0, Math.PI * 2)
      ctx.stroke()

      // Compass letters rotating with the map (N in world is -z, east is +x).
      const theta = -Math.PI / 2 - player.heading
      const rr = half - 11
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const cardinals: Array<[string, number, number]> = [
        ['N', 0, -1],
        ['E', 1, 0],
        ['S', 0, 1],
        ['W', -1, 0],
      ]
      for (const [labelText, dx, dz] of cardinals) {
        const a = Math.atan2(dz, dx) + theta
        const px = half + Math.cos(a) * rr
        const py = half + Math.sin(a) * rr
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,.6)'
        ctx.strokeText(labelText, px, py)
        ctx.fillStyle = labelText === 'N' ? '#e2564a' : '#fff'
        ctx.fillText(labelText, px, py)
      }
    },

    setVisible(v) {
      canvas.hidden = !v
    },

    dispose() {
      canvas.remove()
    },
  }
  return api
}
