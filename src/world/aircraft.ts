import * as THREE from 'three'

/**
 * Traffic in the sky over the wood: airliners, bizjets, turboprops, an old
 * An-2 biplane, helicopters and now and then a hot-air balloon — one at a
 * time, on a straight line across the sky. Ported from the sibling project
 * `kryadov/race-the-city` (src/app/aircraft.ts); what changed on the way:
 * a seeded generator instead of `Math.random` (CLAUDE.md, Determinism), the
 * heights and the crossing kept inside this wood's own sky dome (1500 m), the
 * An-2, navigation lights at night, and nothing flying in fog.
 */

export type AircraftKind = 'airliner' | 'turboprop' | 'jet' | 'biplane' | 'helicopter' | 'balloon'

interface Profile {
  /** Cruising height over the wood, metres. */
  alt: number
  /** m/s. */
  speed: number
  /** Drawn this much oversized: a true-size airliner at this range is a few
   *  pixels across, and seen through a gap in the canopy it would be none. */
  scale: number
  trail: boolean
}

/** Heights over the ground, for a walker looking up through the crowns, not
 *  for realism — at a true cruising altitude nothing would ever be seen from
 *  the forest floor. The low fliers keep under the clouds (world/clouds.ts,
 *  70 m and up) or the clouds would hide them; the airliners go over them and
 *  show in the gaps. All stay under the sky dome across the whole crossing. */
export const AIRCRAFT_PROFILES: Record<AircraftKind, Profile> = {
  airliner: { alt: 380, speed: 85, scale: 6, trail: true },
  jet: { alt: 430, speed: 130, scale: 5, trail: true },
  turboprop: { alt: 260, speed: 55, scale: 4.5, trail: false },
  // The crop-duster of every Russian childhood, low and slow over the trees.
  biplane: { alt: 58, speed: 38, scale: 2.4, trail: false },
  helicopter: { alt: 52, speed: 28, scale: 2.2, trail: false },
  // A balloon goes where the wind goes, which is barely anywhere.
  balloon: { alt: 50, speed: 5, scale: 2.2, trail: false },
}

/** How far out they enter and leave, metres — the crossing's whole length.
 *  Half of it plus the height stays inside the 1500 m sky dome. */
export const AIRCRAFT_SPAN = 2400
/** Seconds between one leaving and the next arriving. */
const GAP_MIN = 25
const GAP_MAX = 80

/** Envelope colours: a balloon that isn't gaudy isn't a balloon. */
const BALLOON_SILKS = [0xd0453f, 0xe8b13a, 0x3a6ea5, 0x3f8f5e, 0xdedad2]

export interface Aircraft {
  group: THREE.Group
  /**
   * @param night 0 day .. 1 full night — the navigation lights come on
   * @param hidden nothing flies (fog, or the player is underground)
   * @param groundY the land under the camera — heights are over it
   */
  update(dt: number, camX: number, camZ: number, night: number, hidden: boolean, groundY?: number): void
  /** Debug (`&sky=`): sends this kind over right now, passing nearly overhead. */
  summon(kind: AircraftKind, camX: number, camZ: number): void
}

/** They fly in clear air above the forest's haze; the haze is not painted
 *  over them, the same as the sky dome. */
const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true, fog: false })

const glass = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: c, flatShading: true, fog: false, transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.2,
  })

/** A navigation light: a small glowing ball, hidden by day. */
function navLight(color: number, x: number, y: number, z: number, blink: boolean): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshBasicMaterial({ color, fog: false }),
  )
  m.position.set(x, y, z)
  m.userData.navLight = blink ? 'blink' : 'steady'
  m.visible = false
  return m
}

/** Every airframe points +x. */
function build(kind: AircraftKind, rand: () => number): THREE.Group {
  const g = new THREE.Group()
  const body = mat(
    kind === 'jet' ? 0x9aa4ae : kind === 'helicopter' ? 0x2f4f6f : kind === 'biplane' ? 0x4f6e3a : 0xe8ecf2,
  )

  if (kind === 'balloon') {
    const silk = BALLOON_SILKS[Math.floor(rand() * BALLOON_SILKS.length)]
    const env = new THREE.Mesh(new THREE.SphereGeometry(4.4, 12, 10), mat(silk))
    env.scale.set(1, 1.15, 1)
    env.position.y = 6.4
    g.add(env)
    // Gores, so it reads as fabric panels rather than a beach ball.
    for (let i = 0; i < 4; i++) {
      const gore = new THREE.Mesh(new THREE.SphereGeometry(4.45, 12, 10, 0, 0.28), mat(0xf2f2ee))
      gore.rotation.y = (i * Math.PI) / 2
      gore.scale.set(1, 1.15, 1)
      gore.position.y = 6.4
      g.add(gore)
    }
    const throat = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 10), mat(silk))
    throat.rotation.x = Math.PI
    throat.position.y = 2.6
    g.add(throat)
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 1.7), mat(0x8a6a4a))
    basket.position.y = 0.6
    g.add(basket)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 1.85), mat(0x6b5138))
    rim.position.y = 1.24
    g.add(rim)
    for (const [bx, bz] of [[0.4, 0.3], [-0.35, -0.35]] as const) {
      const person = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.26), mat(0x3a6ea5))
      person.position.set(bx, 1.5, bz)
      g.add(person)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), mat(0xe0ac69))
      head.position.set(bx, 1.94, bz)
      g.add(head)
    }
    for (const [rx, rz] of [[0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]] as const) {
      const rope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), mat(0x33363d))
      rope.position.set(rx, 1.9, rz)
      g.add(rope)
    }
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 6), mat(0xb5aea0))
    burner.position.y = 2.5
    g.add(burner)
  } else if (kind === 'helicopter') {
    // Cabin: a stubby teardrop, widest at the cockpit and tucked in toward the boom.
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), body)
    cabin.scale.set(1.55, 1.05, 1.1)
    cabin.position.x = 0.35
    g.add(cabin)
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), glass(0x9fd0e6))
    canopy.scale.set(1.2, 0.9, 1.0)
    canopy.position.set(1.35, -0.15, 0)
    g.add(canopy)
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.62, 5.4, 7), body)
    boom.rotation.z = Math.PI / 2
    boom.position.set(-3.3, 0.15, 0)
    g.add(boom)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.15), body)
    fin.position.set(-6.2, 0.55, 0)
    g.add(fin)
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 2.6), body)
    stab.position.set(-5.7, 0.1, 0)
    g.add(stab)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.2), mat(0x26405a))
    deck.position.set(-0.1, 0.95, 0)
    g.add(deck)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6), mat(0x2a2c30))
    mast.position.set(-0.1, 1.55, 0)
    g.add(mast)
    for (const z of [1, -1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.12), mat(0x2a2c30))
      skid.position.set(-0.2, -1.55, z * 1.05)
      g.add(skid)
      for (const sx of [0.7, -1.1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), mat(0x2a2c30))
        strut.position.set(sx, -1.05, z * 0.9)
        strut.rotation.x = -z * 0.22
        g.add(strut)
      }
    }
    // Rotors spin: a helicopter with still blades reads as a crash.
    const rotor = new THREE.Group()
    rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 6), mat(0x2a2c30)))
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), mat(0x33363d))
      blade.rotation.y = (i * Math.PI) / 2
      rotor.add(blade)
    }
    rotor.position.set(-0.1, 2.0, 0)
    rotor.userData.rotor = 'main'
    g.add(rotor)
    const tailRotor = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const tb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.18), mat(0x33363d))
      tb.rotation.x = (i * Math.PI) / 2
      tailRotor.add(tb)
    }
    tailRotor.position.set(-6.2, 0.55, 0.3)
    tailRotor.userData.rotor = 'tail'
    g.add(tailRotor)
    g.add(navLight(0xff3020, 0.2, -1.2, 0, true))
  } else if (kind === 'biplane') {
    // An-2: a stout fuselage, two stacked straight wings with struts, a round
    // engine cowl and one big propeller.
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.35, 10, 8), body)
    fuselage.rotation.z = Math.PI / 2
    g.add(fuselage)
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.9, 10), mat(0x3a3c38))
    cowl.rotation.z = Math.PI / 2
    cowl.position.x = 5.2
    g.add(cowl)
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.1), glass(0x9fd0e6))
    cockpit.position.set(3.4, 0.8, 0)
    g.add(cockpit)
    for (const [y, span] of [[1.5, 18], [-0.6, 14]] as const) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, span), body)
      wing.position.set(2.2, y, 0)
      g.add(wing)
    }
    for (const z of [5.5, -5.5, 2.2, -2.2]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), mat(0x2a2c30))
      strut.position.set(2.2, 0.45, z)
      g.add(strut)
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 5), body)
    tail.position.set(-4.6, 0.3, 0)
    g.add(tail)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.16), body)
    fin.position.set(-4.6, 1.4, 0)
    g.add(fin)
    for (const z of [1, -1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 8), mat(0x2a2c30))
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(3, -1.7, z * 1.4)
      g.add(wheel)
    }
    const prop = new THREE.Group()
    prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.6, 0.3), mat(0x2a2c30)))
    prop.position.x = 5.75
    prop.userData.rotor = 'prop'
    g.add(prop)
    g.add(navLight(0xff3020, 2.2, 1.5, 9, false), navLight(0x30ff50, 2.2, 1.5, -9, false))
  } else {
    const long = kind === 'turboprop' ? 9 : kind === 'jet' ? 11 : 12
    const fuselage = new THREE.CylinderGeometry(kind === 'jet' ? 0.6 : 0.9, 0.5, long, 7)
    fuselage.rotateZ(Math.PI / 2)
    g.add(new THREE.Mesh(fuselage, body))
    // Swept wings on the jet, straight on the others — the silhouette is the tell.
    const span = kind === 'turboprop' ? 11 : 13
    const w = new THREE.Mesh(new THREE.BoxGeometry(kind === 'jet' ? 3.4 : 2.6, 0.22, span), body)
    if (kind === 'jet') w.position.x = -1
    g.add(w)
    const tail = new THREE.BoxGeometry(1.6, 0.2, 5)
    tail.translate(-long * 0.42, 0, 0)
    g.add(new THREE.Mesh(tail, body))
    const fin = new THREE.BoxGeometry(1.6, 2.6, 0.2)
    fin.translate(-long * 0.42, 1.3, 0)
    g.add(new THREE.Mesh(fin, body))
    if (kind === 'turboprop') {
      for (const z of [3.2, -3.2]) {
        const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 2.4, 6), body)
        nac.rotation.z = Math.PI / 2
        nac.position.set(0.6, 0, z)
        g.add(nac)
        const prop = new THREE.Group()
        prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 0.3), mat(0x2a2c30)))
        prop.position.set(1.9, 0, z)
        prop.userData.rotor = 'prop'
        g.add(prop)
      }
    } else if (kind === 'airliner') {
      for (const z of [3.6, -3.6]) {
        const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 7), mat(0x9aa2ac))
        eng.rotation.z = Math.PI / 2
        eng.position.set(0.4, -0.7, z)
        g.add(eng)
      }
    }
    // Red to port (left, +z when pointing +x), green to starboard, a white strobe under the belly.
    const tip = span / 2
    g.add(navLight(0xff3020, 0, 0, tip, false), navLight(0x30ff50, 0, 0, -tip, false))
    g.add(navLight(0xffffff, 0, -0.9, 0, true))
  }
  g.scale.setScalar(AIRCRAFT_PROFILES[kind].scale)
  return g
}

function trailMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(AIRCRAFT_SPAN * 0.35, 6)
  geo.rotateX(-Math.PI / 2)
  geo.translate(-AIRCRAFT_SPAN * 0.175, 0, 0)
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, fog: false }),
  )
}

/**
 * Builds every airframe once (hidden) and flies one at a time past the
 * camera. Nothing here navigates: each is scenery a few hundred metres up on
 * a straight line, and the kinds differ in height, speed and silhouette,
 * which is all that reads at that range anyway.
 *
 * @param rand a seeded generator (`mulberry32`) — never `Math.random`
 */
export function createAircraft(scene: THREE.Scene, rand: () => number): Aircraft {
  const group = new THREE.Group()
  group.name = 'aircraft'
  scene.add(group)
  const kinds = Object.keys(AIRCRAFT_PROFILES) as AircraftKind[]
  const frames = new Map<AircraftKind, THREE.Group>()
  for (const k of kinds) {
    const f = build(k, rand)
    if (AIRCRAFT_PROFILES[k].trail) f.add(trailMesh())
    f.visible = false
    group.add(f)
    frames.set(k, f)
  }

  let wait = 6 + rand() * GAP_MAX
  let kind: AircraftKind | null = null
  let t = 0
  let heading = 0
  let originX = 0
  let originZ = 0
  let spin = 0

  const hide = (): void => {
    for (const f of frames.values()) f.visible = false
  }

  return {
    group,
    summon(k, camX, camZ) {
      kind = k
      // Always flying east (+x), so a test knows where to look: west, and up.
      heading = 0
      const reach = k === 'balloon' ? AIRCRAFT_SPAN * 0.12 : AIRCRAFT_SPAN * 0.5
      originX = camX - Math.cos(heading) * reach - Math.sin(heading) * 60
      originZ = camZ - Math.sin(heading) * reach + Math.cos(heading) * 60
      // Already most of the way to its nearest point.
      t = (reach * 0.92) / AIRCRAFT_PROFILES[k].speed
      hide()
    },
    update(dt, camX, camZ, night, hidden, groundY = 0) {
      if (!kind) {
        wait -= dt
        if (wait > 0) return
        kind = kinds[Math.floor(rand() * kinds.length)]
        heading = rand() * Math.PI * 2
        const offset = (rand() - 0.5) * 900 // how wide of us it passes
        const reach = kind === 'balloon' ? AIRCRAFT_SPAN * 0.12 : AIRCRAFT_SPAN * 0.5
        originX = camX - Math.cos(heading) * reach - Math.sin(heading) * offset
        originZ = camZ - Math.sin(heading) * reach + Math.cos(heading) * offset
        t = 0
        hide()
      }

      const p = AIRCRAFT_PROFILES[kind]
      t += dt
      const d = t * p.speed
      // A balloon at 5 m/s would take eight minutes to cross; it drifts across
      // a short stretch of sky and then it is gone.
      const run = kind === 'balloon' ? AIRCRAFT_SPAN * 0.25 : AIRCRAFT_SPAN
      if (d > run) {
        kind = null
        hide()
        wait = GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
        return
      }

      const f = frames.get(kind)!
      // It keeps flying out of sight in fog, so the timing stays the same.
      f.visible = !hidden
      f.position.set(originX + Math.cos(heading) * d, groundY + p.alt, originZ + Math.sin(heading) * d)
      f.rotation.set(0, -heading, 0)
      if (kind === 'balloon') {
        // It drifts and swings under the envelope; it does not fly nose first.
        f.rotation.y = spin * 0.15
        f.position.y = groundY + p.alt + Math.sin(spin * 0.4) * 4
        f.rotation.z = Math.sin(spin * 0.7) * 0.04
        f.rotation.x = Math.cos(spin * 0.55) * 0.03
      }
      spin += dt
      const lightsOn = night > 0.3
      const strobe = (spin % 1.2) < 0.12
      f.traverse((o) => {
        const r = (o.userData as { rotor?: string }).rotor
        if (r === 'main') o.rotation.y = spin * 26
        else if (r === 'tail' || r === 'prop') o.rotation.x = spin * 34
        const light = (o.userData as { navLight?: string }).navLight
        if (light) o.visible = lightsOn && (light === 'steady' || strobe)
      })
    },
  }
}
