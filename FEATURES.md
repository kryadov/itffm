# itffm — features & how to play

A quiet first-person walk through a **real wood**, built on the fly from real
place data. A mushroom encyclopedia is its heart, but the wood has grown a
life of its own around that: a hut, a campfire, a mine, a railway, wildlife,
weather, a day and night cycle, and five things lost in the wood waiting to
be found.

> Keep this file current: when you add a feature or change an existing one,
> update the relevant section here in the same change (see CLAUDE.md).

---

## Start screen

Behind the picker itself, a quadcopter circles slowly over the real, live
offline demo wood — the train runs, wildlife moves, and someone waves by the
shelter — the same wood any "Just show me a wood" press drops you into, not
a video or a screenshot of one.

On load you get a **place picker**: name a real place — your own local wood,
a nature reserve, dunes, a wetland — or pick one of several **known places**
offered as one-tap buttons. Terrain comes from real elevation data and the
trees, clearings, water and paths come from OpenStreetMap, so the wood
actually matches that place's real ecology. **"Just show me a wood"** drops
you straight into a **baked-in offline demo wood** instead — and if a named
place ever fails to build (not found, no map data, the network down), the
game falls back to that same demo wood rather than an error screen. A place
you've built before, and the elevation tiles it stood on, are cached offline
in the browser, so typing the same name again (or the network being down
this time) loads it straight from there — no place is fetched from the
network twice. A
**plot size** picker controls how large an area to build once you've typed a
place. A **language switch** (Russian/English) and a **settings** gear (the
same panel the in-game pause menu opens — walking speed, mouse sensitivity,
sound, weather, minimap and more) both sit on this same screen, so you never
have to start the game just to change either.

---

## Controls

| Keys | Action |
|---|---|
| `W` `A` `S` `D` | Walk |
| `Shift` | Run (in the quadcopter: down) |
| `Ctrl` or `C` | Crouch — press once to crouch and walk crouched, again to stand; not on the bicycle (in the quadcopter: hold to go down) |
| `Space` | Jump (in the quadcopter: up) |
| `E` | Examine a find, pick up/deliver a quest item, chop scrub (once the hatchet is owned), open/close the hut's door |
| `F` | Flashlight |
| `L` | Toggle the carried lamp on/off, once owned (layered on top of its own automatic day/night/mine rule) |
| `R` | Launch the quadcopter, once you have it; while it flies, bring it home |
| `Tab` | Encyclopedia |
| `Q` | Sort the basket |
| `M` | Settings |
| `H` | This same control list, in-game |
| `Esc` | Pause menu — a second `Esc` closes it again, same as "Continue" |

On a phone or tablet, the same actions come from an on-screen stick, a
swipe-to-look zone, and a tap.

---

## Finding things

Everything you can pick — mushroom, berry, herb, nut, a fish, or a plain
forest find — is **generated from its own species data**, not a hand-modelled
asset, and placed by real ecology: the birch bolete grows under a birch, the
slippery jack among young pines on sand, the oyster mushroom on dead wood.
**57 species** across six kinds (mushroom, berry, herb, nut, fish, find) ship
today, each with real field marks, edibility and season.

- **Examine (`E`)** turns a find over in your hands — cap, underside, stipe,
  ring, volva, whatever marks it — before you decide to collect or leave it.
- Everything collected stays in your own **encyclopedia** (`Tab`) for good —
  no timers, nothing to lose. Filter by kind, biome, edibility, underside
  type or season; an undiscovered species shows as a flat silhouette instead
  of nothing at all.
- The **basket** holds a limited number of finds; **sort the basket** (`Q`)
  tallies what's in it and adds it all to your encyclopedia at once.
- Add your own **note** to any discovered species' card.
- **Export the whole encyclopedia as one image** — every discovered species
  on a grid, for sharing.

---

## A wood, not just a spawn table

- A **hut** with a working door: walk in, and there's a floor of worn pine
  boards with a woven rag rug, a bed, a table with a cup and a lit lamp, a
  painting on the wall, a firewood pile and a well outside. The hut stands
  level on a slope, so the ground never comes up through its floor.
- A **campfire** with a pot on a tripod and a bench, apart from the hut on
  its own clearing — its own place in the night's music, too.
- **Reed beds** along the water: cattails with brown heads and long leaves in
  thick stretches with bare bank between, standing in the shallows and on the
  wet margin right at the waterline a pond actually shows, and along both
  banks of a stream.
- Where the wood actually has water, a **fisherman's hut and a boat** at the
  shore — a wooden rowing boat drawn up on the bank: a hollow planked hull,
  tarred below and painted green above, its sheer sweeping up to a pointed
  bow and a flat transom, with thwarts, floorboards and a pair of oars inside.
- A **mine** you can walk into — a branching cave, not a single corridor: a
  wide, tall doorway set in a rock outcrop on the hillside, opening onto level
  ground where a trail arrives, leads into a real maze: nine to twelve forks,
  some of them three ways, seven to fourteen dead ends and some forty metres of
  depth, solid rock always standing between passages that are not joined — with
  the diamond in the dead end farthest along the tunnels from the mouth. Every passage is closed
  rock (no gaps, nothing to see through), and it is dead dark inside except for
  your own lamp and a fading pool of daylight at the doorway, so the way out is
  always the lit opening behind you. **Bats** live in it: a few colonies
  hang head down from the ceiling at the dead ends, wings wrapped round them,
  and come near one and it takes wing — the whole colony flickers up and down
  the passage in your light for a few seconds, then settles back where it was.
  Sited on a real surveyed cave/adit/
  mineshaft mouth where one exists, or picked procedurally otherwise, so every
  wood has one.
- A **railway** winding through the wood: a narrow-gauge line with real bends
  (it goes round ponds and streams rather than through them, keeps off steep
  ground and away from the hut), straight at each end and curving between. It
  starts and ends in a **tunnel portal** — a stone headwall with a dark mouth
  under a grassy mound — so it plainly comes from somewhere and goes somewhere.
  A long **train** runs on it: a diesel locomotive (a cab with windows on every
  side, a bonnet, a yellow bumper and buffers, a grille, handrails, an exhaust
  stack puffing smoke, a headlight that switches on at night) pulling five
  wagons — coaches with rows of windows, a boxcar, a flatcar of logs — every
  window glowing amber after dark, all on wheels that turn. It comes out of one
  tunnel, brakes for the first platform, stands there a minute or so, runs on to
  the second, stands, and drives into the far tunnel and out of sight for a while,
  before it comes back the other way. Its cars follow the bends and the slope on
  two axles each and **lean out of a curve**, and it nods under braking. It is
  shown on the minimap as a yellow dot while it is out in the open.
  Each end has a **station**: a long low platform along the whole standing train,
  with a yellow edge line, a roofed shelter on posts, a bench and lamp posts that
  light after dark. The platform is a step you simply walk onto; the shelter's
  posts, the bench, the lamp posts and the tunnel mounds are solid, and nothing
  grows there.
- **Changing weather** by default: by day it turns between clear and rain,
  mornings and evenings bring fog or clear, and a night is clear or foggy —
  each change rolling in over a few seconds, the sun dimming under rain and
  fog. Any one weather (clear, rain, snow, fog) can be pinned in settings
  instead. A **day/night cycle** with a real sun and moon, changeable in
  settings or left on a self-running cycle.
- **Aircraft overhead** now and then, one at a time: an airliner or a bizjet
  high up in the gaps between the clouds with a faint contrail, a turboprop,
  and low over the trees a helicopter with spinning rotors, an old An-2
  biplane or a drifting hot-air balloon. At night they show navigation lights
  and a blinking strobe; in fog you see none.
- A **self-running accelerated calendar**: the game clock runs faster than
  real time, so a single play session moves through real seasons instead of
  staying stuck on the day you started, driving what's in season and how
  long it's been since rain.
- **Wildlife**, each animal with legs that walk and run in step, a head it
  lowers to eat, and its own colouring: **moose** (bulls with broad palmate
  antlers, cows without) browsing and wandering slowly, trotting off if you
  come close; a **brown bear** living by the thickest patch of berries and
  mushrooms, head down eating them, moving off at a walk when it notices you;
  a sounder of **wild boar** rooting about together; **beavers** gnawing a
  tree by the water (only where the wood has water), fleeing into it; **hares**
  that bound away, **red squirrels** that make for a tree, **adders** with a
  dark zigzag that slide slowly off. Between scares they graze, stroll about
  their own patch and wander back to it. Birds nest and fly between the trees,
  bees work a wild hive — a coiled straw skep on a bracketed shelf high up a
  trunk, under a bark roof, honey at its door — dragonflies hover over the water.
- **Fading tracks** (on by default, opt-out in settings): footprints trail
  behind you as you walk, a thin tyre track behind the bicycle, and paw
  prints or a sinuous trail behind a fleeing hare, squirrel or snake — pressed
  into the actual ground in a dark earth tone, not a black smear, and gone
  again after a while rather than staying forever.
- Streams, ponds, waterfalls and springs, each animated, not a flat panel.
- A **minimap** (opt-in in settings) and a scrolling **compass**. Once the
  minimap is on, it always marks the hut, the mine, the campfire and the
  railway's two stops, draws the railway line itself and shows where the train is — never a single
  mushroom. A second, separate opt-in also marks the four hidden
  quest items while they're still out there, for anyone who wants the hint
  instead of the search.

---

## Five things lost in the wood

A one-time prompt at the start of a new game points you at five lost items,
each found in its own place and carried home (`E` to pick up, `E` at the
hut's doorway to deliver). The rod and the bicycle can then be taken again
from the hut (`E` where they wait), and put back the same way — you use them
in your hands. Standing close enough to pick one up shows its
name on screen, the same way aiming at a mushroom does. The four found out in
the open (everything but the diamond) each render as their own real
model — an axe, a lantern, a fishing rod, a bicycle — not a shared coloured
shape, and sit spread around the hut in four separate directions rather than
clustering in whichever one the dice happened to favour:

- **Hatchet** — once delivered, `E` while facing a bush/thicket clears it;
  the wood's various detour thickets (including ones blocking the other
  quest items) become choppable.
- **Lamp** — a warm light that follows you once owned, on automatically
  after dark or inside the mine, with a manual `L` override on top.
- **Fishing rod** — lets you catch fish while it is in your hands. Fish swim
  in the wood's own ponds and streams — in the shallows along the bank, on the
  surface, where you can reach them — not on the land — and they really swim:
  each loops its own patch of water head first, gliding, slowing almost to a
  hover and picking up again, its body swinging with the tail beat, never
  leaving the water or the reach of the bank. Each fish is built
  from its species like a real one: a dark back and pale belly, a forked tail,
  its dorsal, anal and paired fins, eyes, and the marks that tell them apart
  — the pike long with pale spots and its dorsal far back, the perch barred
  with two dorsals and red lower fins, the roach silver with a red eye. Once delivered the rod
  leans by the hut's own table (you take it from inside the hut with `E`).
  Out in the wood it lies flat as a chunky pole with a pale handle and a reel,
  raised clear of a trail so it can be seen. A fish in your crosshair without
  the rod in hand says it needs a fishing rod, and `E` on it says where the
  rod is, instead of quietly doing nothing.
- **Bicycle** — while you carry it you are riding it: 1.6 times faster
  everywhere, path or not; the view stops swaying like a walk and there are no
  footsteps; its handlebar and front wheel show low in your view, the wheel standing
  straight in line with the frame and running out past the bottom of the
  screen, and turn as you turn; its tread is shaded in soft sections, so you
  can see it roll even riding straight; the wheel
  spins with the speed you ride, its spokes visibly sweeping round as it does
  (it runs backward when you back up and stops when you do). You leave it against whichever wall of the hut you are standing at when
  you press `E` (any of the four — not only by the door), where it stands on
  the real ground, off the doorway, and is gone from your view — and take it
  again from there with `E`. Left at the hut it does nothing.
- **Diamond** — found at the end of the mine's own branching cave, not near
  the hut like the other four; you have to actually search the forks to find
  it. A many-faceted, asymmetric cut, not a plain gem, and it visibly
  brightens as you approach it with a lit lamp. It is not for the hut: you
  give it to the **conductor** — `E` anywhere on the platform beside the
  train while it stands there (with no train in, `E` at a platform says to wait) — and it
  earns you the **quadcopter**. A returning save whose diamond already sat on
  the table gets it back in its pocket, to hand over. The empty drone box
  ends up on the hut's table once the quadcopter is yours.

### Fish soup (ukha)

Catch a fish, then press `E` at the campfire: it goes from your basket into
the pot, a ladle appears in it and steam rises while the ukha simmers (twenty
seconds of play). When it is ready (a toast says so, and the steam thickens)
`E` takes it off the fire; carry it into the hut and `E` sets a steaming
bowl of ukha — broth, a piece of fish, potato and carrot, a spoon — on the
table. It shows in Rules & Quests with where it stands, and survives a reload.

### Honey

The hut has a shelf on its back wall with an empty jar on it. Take it (`E`)
and you carry it in view; walk up to the wild hive with it and the bees see
you off. Launch the quadcopter instead and the jar hangs under it on a string
(you see it swinging below the drone's camera); fly to the hive and hold the
drone by it for a few seconds until the jar fills with amber honey, bring it
home, and set the jar of honey back on the shelf (`E`). The hive shows on the
minimap while the honey is being fetched, and Rules & Quests lists where it
stands. The bowl of ukha, too, is carried in view on its way to the hut.

### The quadcopter

Once the diamond is with the conductor, the train pulls out within moments, and
when it stands at the **other** end of the line it leaves a wooden crate on the
platform, toward one end of it (a visit later, the crate is simply there); `E` at the crate makes the quadcopter yours.

`R` launches it, and the view is **from the quadcopter** — the screen shows its
own camera, a crosshair, and at the bottom its height above the ground, its
distance from you, the battery, the radio signal and an arrow to where home is.
You, meanwhile, stand where you launched it, drawn as a little person with a
cap and the controller in your hands, turning to watch it and looking up at
it; a tall orange pole with a flag stands over you, showing above the trees, so
you can find your way back when the canopy hides you.

- **Flying:** `W` `A` `S` `D` fly the way the camera looks, the mouse turns and
  tilts it, `Space` climbs and `Shift` descends. It eases into its speed and
  leans into a sideways move.
- **Limits:** it cannot get further than 150 m from you (the signal fades from
  100 m), climbs no higher than 40 m above the ground beneath it, and its
  battery lasts two minutes — it recharges while you are on foot, in about a
  minute. Trunks are solid, foliage is soft: it weaves between the trunks and
  through the crowns.
- **Home:** `R` again, or an empty battery, sends it home by itself — up over
  the trees, across, and down to you.
- **Where:** in the open only, not inside the hut or the mine. Anything that
  opens a menu pauses it.
- The wood keeps loading around the quadcopter, not around you, and the
  minimap follows it.
- Not yet on touch screens (there is no stick for climbing).

A **"Rules & Quests" screen**, in the pause menu, lists the basket/
encyclopedia loop above plus all five items, what each one unlocks, and
whether it's still out there, in your hands, or already home.

---

## Settings (`M`)

- **Language** — Russian/English, live, no restart.
- **Walking speed** and **mouse sensitivity** multipliers.
- **Mushroom draw distance**.
- **Sound, music and footstep volume**, independently.
- **Time of day** — a self-running cycle, or pinned to day/night.
- **Weather** — auto (changes on its own, the default), or pinned to clear,
  rain, snow or fog.
- **Minimap** on/off, plus a separate **quest items on the map** on/off,
  and **invert look** on/off.
- **Ground tracks** on/off — footprints, tyre and animal tracks (on by
  default).
- **Reset quests** — behind a confirmation, from the pause menu or the start
  screen: all five items go back into the wood at their usual spots, the
  hut's trophies and the bicycle's wall are forgotten, and the walk restarts
  from the start screen. Found mushrooms, the encyclopedia, notes, language,
  settings and the calendar stay.

---

## Saves and offline

No backend — everything runs in the browser and progress (discovered
species, finds, quest state, notes, preferences) saves to IndexedDB.
Works offline once loaded once, and installs to the home screen like an
app on a phone or tablet. A long session gets told when a new version has
shipped: a banner offers to reload now or later, rather than reloading on
its own and dropping whatever you're doing.

---

## Technology and data

TypeScript, [Three.js](https://threejs.org), Vite — no other runtime
dependency. Elevation comes from
[AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/); trees,
clearings, water, paths and structures come from
[OpenStreetMap](https://www.openstreetmap.org). Species taxonomy rests on
[GBIF](https://www.gbif.org) and [Wikidata](https://www.wikidata.org)
(both CC0); morphology, ecology and edibility are curated by hand — no open
structured database of those characters exists.
