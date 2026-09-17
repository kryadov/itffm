# Fading tracks on the ground — design

Date: 2026-09-17
Status: approved, to implement after the bicycle work lands.
Donor: `kryadov/race-the-city`'s `driftfx.ts` (tyre marks and smoke puffs as
instanced ring buffers with a fade).

## 0. Why

The wood does not register that anyone has passed through it. A pick leaves a
trace (a dark disc of disturbed litter) and nothing else does. Prints are one
of the oldest things a person notices in a wood: your own behind you, a
hare's that bolted, the thin line of a tyre. They also do quiet work — they
show you where you have already looked.

## 1. Decisions

| Decision | Why |
|---|---|
| Five kinds of mark: the player's foot, the bicycle's tyre, and hare, squirrel and snake (`TrackKind`) | Everything that moves over the ground at a walk. Birds and insects leave none. |
| One instanced ring buffer per kind (`createTrackFx`) — five draw calls whatever the count | Never one mesh per footprint — the same arithmetic as the mushrooms (`CLAUDE.md`). The oldest mark is overwritten when a pool is full. |
| **Not black**: a dark, desaturated earth tone per kind (`TRACK_COLOR`), translucent (`TRACK_OPACITY` 0.28–0.45), just above the ground (`GROUND_OFFSET` 1.5 cm) | The donor's marks are rubber on asphalt. In a wood a print is pressed litter — a cousin of `world/ground.ts`'s colours, and a footprint must not read as the same mark as a paw. |
| Marks fade by **shrinking**, not by alpha: full size, then down to nothing over the last `FADE_FRACTION` (35%) of their life (`fadeScale`) | `InstancedMesh` has no per-instance opacity. Shrinking near the end reads as the litter springing back. |
| Each kind lives its own time (`TRACK_LIFETIME`: foot 45 s, bike 55 s, hare 25 s, squirrel 20 s, snake 30 s) | Boots and tyres press deeper than paws. Long enough to see where you came from, short enough that a session does not carpet the wood. |
| Sizes per kind (`TRACK_SIZE`, length × width), each mark jittered ±15% (`sizeJitter`, seeded) | No two prints alike, deterministically. |
| Footprints alternate left and right off the walking bob (`footSide(bobPhase)`, one per π), offset sideways from the line of travel (`footOffset`) | The same footfall that times the footstep sound. Standing still leaves nothing. |
| No footprints while riding; a single tyre line instead (`layBike`) | You are on the bicycle. |
| Animals leave marks only while **fleeing** | A grazing hare's prints would pile up on one spot; a fleeing one draws a line away from you, which is the story worth seeing. |
| Each mark samples the ground under itself (`lay*` take the provider) | Callers never have to; prints sit on slopes. |
| On by default; a settings toggle turns them off (`Prefs.groundTracks`) | Some players will find them noise. Turning off also clears what is there (`reset()`). |

## 2. Out of scope

- Prints in snow or mud that last longer — weather does not yet change the
  ground.
- Tracks of the large animals.
- Tracks that persist across a reload.

## 3. Testing

- Pure: `footSide` alternates every π; `footOffset` puts left and right on
  opposite sides and perpendicular to the heading; `fadeScale` is 1 fresh,
  shrinks near the end, exactly 0 when spent, always within [0, 1];
  `sizeJitter` deterministic for an RNG state and within 0.85–1.15.
- `createTrackFx`: marks sit on the real ground height; a mark is gone after
  its lifetime; disabling and resetting work.
- Look at it: footprints behind the player on a slope, a tyre line, a hare's
  bolt — at noon and at dusk, to check the tone does not go black.
