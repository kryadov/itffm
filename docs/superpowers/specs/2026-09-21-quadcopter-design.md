# The diamond, the train and the quadcopter

Decided with the owner on 2026-09-21, after a brainstorm; written down so the
choices survive the conversation. What actually shipped is in `FEATURES.md`.

## The quest

The diamond (found in the mine) no longer goes to the hut. It is handed to the
**conductor** of the train while the train stands at a platform, and a
quadcopter comes back for it:

1. `E` beside a car of a stopped train, carrying the diamond: the quest item is
   `done` and `save.drone = { stage: 'ordered', crateEnd }`, where `crateEnd`
   is the end of the line the train is NOT standing at (0 west, 1 east).
2. The next time the train stands at `crateEnd`, a crate appears on that
   platform (`stage: 'crate'`).
3. `E` at the crate: `stage: 'owned'`, and the empty drone box stands on the
   hut's table (it replaces the diamond that used to sit there).

At a platform with the diamond and no train in, `E` says to wait for the train.
A save whose diamond had already been delivered to the hut (and so has no
quadcopter) gets the diamond back as `carrying`. Resetting the quests takes the
quadcopter back too.

## The flight

- **View:** the camera IS the drone's — first person from it, never a chase
  camera. The player stays where they launched from and is drawn as a little
  person (`world/pilotFigure.ts`) with the controller in their hands, turning to
  watch the drone and looking up at it. A tall pole with a flag stands over the
  pilot so home can be found above the canopy, which hides them.
- **Controls:** WASD fly relative to where the camera looks, mouse turns and
  tilts, Space up, Shift down, R launches and (while flying) brings it home.
- **Limits:** 150 m from the pilot (signal fades from 100 m), 40 m above the
  ground beneath it, two minutes of battery (recharging on foot, about a minute
  from empty). No launch inside the hut or the mine. Trunks are solid, crowns are
  not (`treeObstacles`): crowns overlap in this wood, and solid ones wedged a
  drone at crown height in 43 of 120 random spots.
- **Home:** R again, or an empty battery, flies it home by itself — up over the
  trees, across, down to the pilot (`game/drone.ts`).
- **What it is for:** scouting the wood — clearings, water, trails, the station,
  the mine. It does not reveal the hidden quest items.
- **Not decided / not built:** night lights on the drone, a photo mode that
  exports to the encyclopedia, touch controls (there is no stick to climb with).

## Where it lives

- `game/drone.ts` — the flight model, pure (`launchDrone`, `stepDrone`,
  `treeObstacles`, `droneReadout`), with tests.
- `world/pilotFigure.ts` — the figure and the beacon. `world/droneCrate.ts` —
  the crate. `world/station.ts` — where the crate stands (`stationCrateSpot`).
- `ui/droneHud.ts` — the drone's screen.
- `world/railway.ts` — `Train.stopped()`: which end the train is standing at and
  where its cars are.
- `main.ts` — the wiring: the diamond's hand-in, the crate, launch/landing, the
  camera, and keeping the wood (streaming, culling, animals) alive around the
  drone instead of the player while it flies.
- Testing the built game: the debug URL takes `&tp=x,z` and `&train=N` (see
  `CLAUDE.md`).
