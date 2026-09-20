# The rod and the bicycle in your hands — design

Date: 2026-09-20
Status: approved with the owner, to implement next.
Builds on: `2026-09-13-quest-items-design.md` (the four items and their
abilities), `2026-09-15-quest-minimap-and-guide-design.md` (trophies at the
hut), and yesterday's redraw of the bicycle side-on (a real diamond frame,
spoked wheels resting on the ground, 1 m wheelbase).

## 0. Why

Once delivered, the rod and the bicycle turn into **passive** abilities: the
rod lets you catch fish anywhere, the bicycle speeds you up on paths, while
both stand as trophies at the hut. That reads wrong in play:

- You ride a bicycle that is leaning against a wall a kilometre away.
- You carry the bicycle home (in view, as a quest item) at walking pace.
- You fish with a rod that is propped by the table.
- And the fish lie on the meadow — the spawner scores them by moisture like a
  mushroom, so "near water" means "in a wet hollow".

## 1. Decisions

| Decision | Why |
|---|---|
| **Fishing needs the rod in your hands** (`quests.rod.state === 'carrying'`), not merely delivered | The ability is the object. A rod at home catches nothing. |
| **Riding is carrying the bicycle**: with it in hand you are on it — 1.6× speed **everywhere**, path or not; the delivered bike's passive path bonus is gone | The owner's numbers. One rule ("you ride what you hold") replaces two that stacked oddly. A bicycle left at the hut does nothing. |
| While riding, the walking bob eases to nothing (`cameraBob(state, scale)`) and there are no footsteps | You are rolling, not walking. |
| Both can be taken back from the hut with `E` — the rod from **inside** (by the table, never through the wall), the bicycle from the wall it was left at — and put back the same way | Items you use should be usable again. One press is one transition (`quest/state.ts`'s `interact`), so taking an item never puts it straight back down. |
| The bicycle is left against **whichever wall you stand at** (`nearestBikeSpot`: four walls, position along it remembered in the save as `BikeSpot`), clear of the doorway, standing on the real ground under both wheels | Only "by the door" meant walking round the hut to leave it; and a fixed spot on a slope sank a wheel into the ground. |
| Carried, the bicycle shows in the view: the handlebar low in front of the eye and the front wheel below it (`game/bikeView.ts`), drawn in a second pass over the frame so it never clips into trunks | Riding something invisible is not riding. A second pass with its own scene keeps it in front of the world, lit by the wood's own light so it darkens at night. |
| The bar turns toward a turn, only while turning (`bikeSteer.ts`: `steerTarget(yawRate)` capped at `MAX_STEER`, eased frame-rate-independently by `smoothSteer`) | A bar that never moves reads as a picture glued to the screen. Starts straight every time it is shown. |
| The front wheel spins with your actual speed (`wheelSpin` over `ROLLING_RADIUS`, the model's own wheel + tyre + tread), backward when you back up, still when you stop (`forwardSpeedOf` along the facing) | So you can see it roll. The radius is the drawn one, so the tread does not slip. |
| A fish in the crosshair without the rod in hand says "needs a fishing rod", and `E` says where the rod is | It used to ignore `E` silently, which reads as a bug. |
| Fish never site on land (`speciesScore` is 0 for fish); `world/fishSpawn.ts` places them in ponds (in the shallows along the bank) and streams, on the surface, and only where someone on the bank can reach them | A pond's surface sits at its lowest bed point, so most of its banks stand metres above it — in the demo wood 6 of 20 fish were reachable that way. |
| The rod lying in the wood is a chunkier model (cork handle, reel) lifted clear of a trail ribbon and pitched along the slope | The old 1–3 cm pole 2 cm off the ground was buried under a 3 cm trail — only its label showed. |

## 2. Out of scope

- A fishing mini-game, a casting animation.
- Mounting/dismounting animation.
- Riding on touch screens beyond what walking already has.

## 3. Testing

- `quest/state.ts`: taking from and leaving at the hut, one transition per
  press.
- `world/shelter.ts`: `nearestBikeSpot` reports distance, keeps the spot along
  the wall, picks a wall from inside; `bikeSpotLocal` finite for every wall;
  the parked bike stops short of the doorway and lies along its wall.
- `game/player.ts`: `ridingSpeedFactor` neutral off the bike, 1.6 on it;
  `cameraBob` scale.
- `game/bikeSteer.ts`: the steering and wheel-spin helpers, including frame-
  rate independence and the rolling radius matching the model.
- `game/bikeView.ts`: hidden until shown; rides with the camera; bar low in
  front of the eye; the wheel's middle and top on screen; turns only while
  turning; starts straight; takes the wood's light; wheel spin follows speed
  and stops when not carried.
- `world/fishSpawn.ts`: every fish in water and reachable from a bank.
- In the built game: take the bicycle, ride (measure ~1.6×), leave it at a
  side wall, take it again; take the rod from inside the hut; a fish in the
  crosshair with and without the rod.
