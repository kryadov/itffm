# Two small quests: ukha over the fire, honey by quadcopter — design

Date: 2026-09-24
Status: approved with the owner (part of the 12-item batch of 2026-09-24),
in implementation.
Builds on: the five quest items (`2026-09-13-quest-items-design.md`), the rod
in hand and fish in the water (`2026-09-20-items-in-hand-design.md`), the
quadcopter (`2026-09-21-quadcopter-design.md`), the campfire and the hut
(`2026-09-09-shelter-and-camp-design.md`), the wild hive
(`2026-09-10-wildlife-design.md`).

## 0. Why

Once the five items are home, the things they unlock have nothing more to
do. A caught fish goes into the basket and the encyclopedia like a mushroom;
the campfire's pot is a prop; the quadcopter scouts and that is all; the wild
hive is scenery. Two small quests join them up — each uses something the
player already earned, and each ends with an object in the hut, the way the
item quests do.

## 1. Decisions

### Ukha (fish soup)

| Decision | Why |
|---|---|
| `E` at the campfire with a fish in the basket puts it in the pot: a ladle appears, steam rises, it simmers `COOK_SECONDS` (20) of play | Short enough to wait for at the fire; long enough to be cooking, not a button. |
| When it is ready a toast says so and the steam thickens; `E` takes it off the fire; carried into the hut, `E` sets a steaming bowl on the table — broth, a piece of fish, potato and carrot, a spoon | Ukha is what you make of a fish by a fire in a Russian wood. The bowl ends where the trophies are. |
| A pure state machine (`quest/soup.ts`): `none → cooking → ready → carrying → done`, with `soupAtFire`, `soupAtHut`, `tickSoup` and the events that drive toasts | The same shape as `quest/state.ts`: testable without a scene, savable as plain data. |
| Saved (`readSoup` accepts only a real state), dropped by the quest reset, listed in Rules & Quests | Rules & Quests now takes extra rows besides the five items. |

### Honey

| Decision | Why |
|---|---|
| An empty jar stands on a new shelf on the hut's back wall; `E` takes it, and you carry it in view | The quest starts at home, where the player will look. |
| On foot with the jar, the bees see you off (within `BEES_REACH` 6 m of the hive) | You do not walk up to a wild hive. That is what the quadcopter is for. |
| Launch the quadcopter with the jar in hand and it **hangs under the drone on a string** — seen swinging below the drone's camera | The drone's first real job. The jar under the camera tells you it is on board. |
| Hold the drone within `HIVE_REACH` (3.2 m) of the hive for `FILL_SECONDS` (3) and the jar fills with amber honey; drift away and the count starts over | A small piloting test: hold steady by the hive. |
| Land, take the full jar, set it back on the shelf with `E` | Ends in the hut like everything else. An empty jar brought home is still empty. |
| A pure state machine (`quest/honey.ts`): `shelf → jar → drone → filled → full → done`, with `honeyAtShelf`, `honeyOnLaunch`, `honeyInFlight`, `honeyOnLand`, `jarInHand`, `jarOnDrone` | A save made mid-flight comes back with the jar in hand (`readHoney`) — the drone is never saved in the air. |
| The hive shows on the minimap while the honey is being fetched | It is the destination of a quest now. |
| The hive is redrawn: a coiled straw skep on a bracketed shelf under a bark roof, with an entrance and honey at the door | It was a plain cone on a board — and now people fly up to look at it. |

### Shared pieces

| Decision | Why |
|---|---|
| What you carry is drawn in view (`game/heldView.ts`): the jar empty or full, in hand or under the drone, and the bowl of ukha on its way to the hut | Carrying something invisible is not carrying it. |
| Smoke and steam share one soft round puff texture (`world/puff.ts`) | The chimney's, the campfire's and the train's smoke were flat grey squares; the new steam would have been too. |
| The hut gets a real plank floor and a woven rag rug, and stands level on the **highest** ground under its footprint (the walls' skirt covers the low side); the player walks on the boards, and grass and finds are kept off them | The bowl and the jar go into a room the player now looks at closely; on a slope the ground and its grass came up through the old flat floor slab. |
| Debug: `&tp=campfire`, `&tp=hive`, `&tp=hut`, `window.__droneToHive()` | Each step is otherwise minutes of play at a frame a second. |

## 2. Out of scope

- Eating, hunger, any effect of the soup or honey beyond being there.
- More recipes.

## 3. Testing

- `quest/soup.ts`: needs a fish to start; fire → simmer → ready → carried →
  on the table; nothing at the hut without soup or at the fire once done;
  reads back only a real state.
- `quest/honey.ts`: shelf → hand → under the drone → filled by the hive →
  hand → shelf; says the quadcopter is needed when the jar is taken before
  there is one; the count restarts when the drone drifts away; an empty jar
  comes home empty; no launch with no jar in hand; reads back only a real
  state, and mid-flight as in hand.
- `world/campfire.ts`: no steam or ladle while empty, steam cooking, more
  when ready. `world/shelter.ts`: the bowl hidden until delivered, then on
  the table top; the shelf holds an empty jar by default and can show it
  empty, full or not at all, up on the back wall inside the hut; the floor
  of separate boards in more than one shade with the rug on top; the hut on
  the highest ground under its footprint.
- In the built game: the whole soup run, and the honey run through
  `__droneToHive()`.
