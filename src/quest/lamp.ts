/**
 * The lamp's own on/off rule, as a pure function of four inputs — owning it
 * at all, whether it's dark enough outdoors, being inside a mine
 * (unconditionally dark there, day or night — see world/mine.ts's own
 * doc comment on why its interior lighting was dimmed), and `manuallyOn` —
 * a player's own `L` toggle (`main.ts`) sitting on top of the automatic
 * on-when-dark rule, the same way the flashlight's `F` key is a plain
 * on/off with no automatic component at all. Kept separate from
 * `game/scene.ts`'s own PointLight so the rule itself stays unit-testable
 * without a DOM or a renderer.
 */
export function lampIsOn(owned: boolean, nightFactor: number, insideMine: boolean, manuallyOn = true): boolean {
  return owned && manuallyOn && (nightFactor > 0 || insideMine)
}
