# Aircraft over the wood — design

Date: 2026-09-22
Status: approved, to implement in the next batch.
Donor: `kryadov/race-the-city`'s aircraft.

## 0. Why

The sky is clouds, a sun and a moon. A real wood a few dozen kilometres from
anywhere hears an airliner every so often, sees a contrail through a gap in
the clouds, and now and then something low and loud — a helicopter, a crop
duster. The quadcopter has also made the sky a place the player looks at.

## 1. Decisions

| Decision | Why |
|---|---|
| Six kinds (`AircraftKind`): airliner, jet (bizjet), turboprop high up; helicopter, biplane, balloon low over the trees | The donor's set, plus the **An-2** biplane — the one aircraft every Russian countryside knows, and low and slow enough to be seen properly. |
| **One at a time**, on a straight line across the sky, with a seeded gap of `GAP_MIN`..`GAP_MAX` (25–80 s) between | A sky with traffic is a city's sky. One at a time is an event. |
| Each kind has a profile (`AIRCRAFT_PROFILES`): height, speed, scale and whether it trails (airliner 380 m at 85 m/s, jet 430 m, turboprop 260 m; biplane 58 m, helicopter 52 m, balloon 50 m at 5 m/s) | The high fliers cruise in the gaps between the clouds with a faint contrail; the low fliers stay **under** the clouds (70 m) and above the trees. |
| Heights are measured from the ground under the camera | Over a hill the low fliers would otherwise skim the canopy or dive into it. |
| Every path stays inside the sky dome (`AIRCRAFT_SPAN` 2400 m crossing, never outside 1500 m) | Past the dome there is nothing to draw against. |
| Rotors and props spin; the helicopter keeps a main and a tail rotor that can spin independently | A frozen rotor reads as a model on a stand. |
| Navigation lights and a blinking strobe at night only; in fog nothing is visible, though the aircraft keeps flying out of sight | Lights are what you see of a plane at night; fog hides the sky entirely — and an aircraft that pauses in fog would pop when it lifts. |
| Balloon silks from a small palette (`BALLOON_SILKS`) | Variety without randomness outside the seed. |
| Seeded (`mulberry32`), never `Math.random` | One seed, one sky. |
| Debug: `&sky=<kind>` sends one over at once, flying east | Headless Chrome renders a frame a second; waiting a minute for an aircraft is not an option. |

## 2. Out of scope

- Engine sound.
- Aircraft reacting to the quadcopter.

## 3. Testing

- A helicopter exposes a main and a tail rotor; something comes over within
  a couple of minutes and spins its rotors or props; deterministic per seed;
  inside the dome the whole way; above the trees and the low fliers under
  the clouds; height from the ground under the camera; nothing visible in
  fog, still flying; navigation lights at night only.
- Look at it: one screenshot per kind through `&sky=`.
