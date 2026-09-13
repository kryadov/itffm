/**
 * The lamp's own on/off rule, as a pure function of three inputs — owning
 * it at all, whether it's dark enough outdoors, or being inside a mine
 * (unconditionally dark there, day or night — see world/mine.ts's own
 * doc comment on why its interior lighting was dimmed). Kept separate from
 * `game/scene.ts`'s own PointLight so the rule itself stays unit-testable
 * without a DOM or a renderer.
 */
export function lampIsOn(owned: boolean, nightFactor: number, insideMine: boolean): boolean {
  return owned && (nightFactor > 0 || insideMine)
}
