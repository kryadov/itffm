import * as THREE from 'three'

export interface Sky {
  mesh: THREE.Mesh
  /** Follows the camera and redraws for the current time of day. `night` is
   *  0 by day, 1 after dusk. `moonPhase` is 0..1 (0/1 new, 0.5 full) — with
   *  no in-game calendar yet (see TODO.md), this is `world/moonPhase.ts`'s
   *  read of tonight's real phase, not a phase the game itself tracks. */
  update(
    camPos: THREE.Vector3,
    horizon: number,
    sunColor: number,
    sunDir: THREE.Vector3,
    sunVis: number,
    night: number,
    moonPhase: number,
  ): void
}

/**
 * A sky dome: one big back-faced sphere carrying a vertical gradient, a
 * glowing sun disc and procedural stars, all driven by uniforms rather than a
 * texture — the project has no texture pipeline (see CLAUDE.md). One extra
 * draw call and a cheap fragment shader; the zenith is derived from the
 * horizon colour so it stays believable without extra keyframes, and the
 * stars are hashed from the view direction rather than being real objects.
 *
 * Ported from race-the-city's app/sky.ts — same shader, `createSky` split
 * into a builder that returns the mesh (the project's convention: a builder
 * returns an Object3D, the caller adds it to the scene) rather than one that
 * takes the scene and adds itself.
 */
export function buildSky(): Sky {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(0x9fc4e8) },
      uSun: { value: new THREE.Color(0xfff2d0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunVis: { value: 1 },
      uNight: { value: 0 },
      uMoonPhase: { value: 0.5 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      uniform float uSunVis;
      uniform float uNight;
      uniform float uMoonPhase;
      varying vec3 vDir;

      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float stars(vec3 dir) {
        vec3 sd = dir * 70.0;
        vec3 cell = floor(sd);
        vec3 f = fract(sd) - 0.5;
        float r = hash13(cell);
        float present = smoothstep(0.978, 0.99, r);
        vec3 off = vec3(hash13(cell + 11.0), hash13(cell + 23.0), hash13(cell + 37.0)) - 0.5;
        float d = length(f - off * 0.7);
        float core = 1.0 - smoothstep(0.0, 0.16, d);
        float halo = (1.0 - smoothstep(0.0, 0.34, d)) * 0.25;
        float mag = 0.4 + 0.6 * hash13(cell + 71.0);
        return (core + halo) * mag * present;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 zenith = uHorizon * 0.55 + vec3(0.0, 0.02, 0.08);
        vec3 sky = mix(uHorizon, zenith, pow(h, 0.6));
        float d = max(dot(dir, normalize(uSunDir)), 0.0);
        float fade = uNight * smoothstep(-0.02, 0.28, dir.y) * (1.0 - smoothstep(0.6, 0.98, d));
        sky += vec3(0.86, 0.9, 1.0) * stars(dir) * fade;

        vec3 moonDir = -normalize(uSunDir);
        float md = max(dot(dir, moonDir), 0.0);
        // Which part of the disc a fragment falls in, flattened to the
        // moon's own local right/up plane — the terminator (the real
        // light/dark boundary, not just a lit-or-not disc) needs to know
        // WHERE on the disc it is, not only how close to its centre.
        vec3 worldUp = abs(moonDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 moonRight = normalize(cross(worldUp, moonDir));
        vec3 moonUp = cross(moonDir, moonRight);
        // Scaled so a fragment right at the disc's own edge (md at the
        // smoothstep's high end below) lands at |local| ≈ 1.
        vec2 local = vec2(dot(dir, moonRight), dot(dir, moonUp)) / 0.0509;
        float lz = sqrt(max(0.0, 1.0 - dot(local, local)));
        // A fake sphere lit from a direction that itself rotates with the
        // phase — phase 0.5 (full) lights the whole near face, 0 and 1 (new)
        // light none of it, 0.25/0.75 split it exactly down the middle —
        // the same terminator geometry a real moon phase actually has.
        float phaseAngle = uMoonPhase * 6.28318530718;
        float lit = step(0.0, local.x * sin(phaseAngle) - lz * cos(phaseAngle));
        float moonDisc = smoothstep(0.9975, 0.9987, md) * lit;
        float moonGlow = pow(md, 900.0) * 0.5 * lit;
        float limb = 0.82 + 0.18 * smoothstep(0.9987, 1.0, md);
        sky += vec3(0.92, 0.93, 0.86) * (moonDisc * limb + moonGlow) * uNight;

        float disc = smoothstep(0.9986, 0.9994, d);
        float glow = pow(d, 220.0) + pow(d, 8.0) * 0.12;
        sky += uSun * (disc + glow) * uSunVis;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), mat)
  mesh.name = 'sky'
  mesh.frustumCulled = false
  mesh.renderOrder = -1

  return {
    mesh,
    update(camPos, horizon, sunColor, sunDir, sunVis, night, moonPhase) {
      mesh.position.copy(camPos)
      ;(mat.uniforms.uHorizon.value as THREE.Color).setHex(horizon)
      ;(mat.uniforms.uSun.value as THREE.Color).setHex(sunColor)
      ;(mat.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir).normalize()
      mat.uniforms.uSunVis.value = sunVis
      mat.uniforms.uNight.value = night
      mat.uniforms.uMoonPhase.value = moonPhase
    },
  }
}
