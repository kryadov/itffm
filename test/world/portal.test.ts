import * as THREE from 'three'
import { placeRailLine, portalSites, pointAt, PORTAL_MOUTH } from '../../src/world/railway'
import { buildPortalMesh } from '../../src/world/portal'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('buildPortalMesh', () => {
  const line = placeRailLine(flat, 90, 4)

  it('builds one portal at each end of the line, at the mouth of its track', () => {
    const { group } = buildPortalMesh(line)
    const portals = group.children.filter((c) => c.name === 'portal')
    expect(portals).toHaveLength(2)
    const sites = portalSites(line)
    portals.forEach((p, i) => {
      expect(p.position.x).toBeCloseTo(sites[i].x, 6)
      expect(p.position.z).toBeCloseTo(sites[i].z, 6)
    })
  })

  it('has a headwall with an opening, a dark mouth and a mound of earth behind it', () => {
    const { group } = buildPortalMesh(line)
    group.updateMatrixWorld(true)
    for (const p of group.children.filter((c) => c.name === 'portal')) {
      expect(p.getObjectByName('mouth')).toBeDefined()
      expect(p.getObjectByName('lintel')).toBeDefined()
      expect(p.children.filter((c) => c.name === 'pillar')).toHaveLength(2)
      const mound = p.getObjectByName('mound')!
      const mouth = p.getWorldPosition(new THREE.Vector3())
      const site = portalSites(line).find((s) => Math.hypot(s.x - mouth.x, s.z - mouth.z) < 1e-6)!
      // the mound lies wholly on the far side of the mouth from the track, and runs well back into the hill
      const pos = (mound as THREE.Mesh).geometry.getAttribute('position')
      const depths: number[] = []
      for (let i = 0; i < pos.count; i++) {
        const w = mound.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, i))
        depths.push((w.x - mouth.x) * site.ox + (w.z - mouth.z) * site.oz)
      }
      expect(Math.min(...depths)).toBeGreaterThan(-0.8)
      expect(Math.max(...depths)).toBeGreaterThan(6)
    }
  })

  it('leaves the opening clear for the rails: no stone across the track at the mouth', () => {
    const { group } = buildPortalMesh(line)
    group.updateMatrixWorld(true)
    const a = pointAt(line, PORTAL_MOUTH + 3) // out on the track, in front of the mouth
    const b = pointAt(line, PORTAL_MOUTH - 0.5) // just inside it
    const raycaster = new THREE.Raycaster(new THREE.Vector3(a.x, 1.0, a.z), new THREE.Vector3(-a.tx, 0, -a.tz), 0, 3.5)
    const hits = raycaster.intersectObjects(group.children, true).filter((h) => h.object.name !== 'mouth' && h.object.name !== 'mound')
    // straight down the track at rail height, the only things met are the dark mouth and the mound behind it
    expect(hits.filter((h) => ['pillar', 'lintel', 'wing'].includes(h.object.name))).toHaveLength(0)
    void b
  })

  it('is solid to a player: the mound and the wings have collision circles', () => {
    const { obstacles } = buildPortalMesh(line)
    expect(obstacles.length).toBeGreaterThanOrEqual(6)
    for (const o of obstacles) {
      expect(o.radius).toBeGreaterThan(0)
      expect(Number.isFinite(o.x + o.z)).toBe(true)
    }
    // and none of them sits on the track in front of the mouth
    for (const s of portalSites(line)) {
      const front = { x: s.x - s.ox * 2, z: s.z - s.oz * 2 }
      for (const o of obstacles) expect(Math.hypot(o.x - front.x, o.z - front.z)).toBeGreaterThan(o.radius)
    }
  })

  it('disposes without throwing', () => {
    const { dispose } = buildPortalMesh(line)
    expect(() => dispose()).not.toThrow()
  })
})
