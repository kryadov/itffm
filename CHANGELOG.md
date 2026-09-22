# CHANGELOG

One line per release, newest to oldest. What exactly and why is in the
commit history; this is only a short summary of what shipped. What's in the
game right now is `FEATURES.md`. A release is a `vX.Y.Z` tag, published to
[GitHub Pages](https://kryadov.github.io/itffm/) by a green build off
`master`.

## v0.101.4
A long play session now learns when a new version has shipped: a banner
offers to reload now or dismiss it, rather than the old build silently
going stale until the player happens to refresh.

## v0.101.3
Fading ground tracks: walking leaves footprints, riding the bicycle leaves a
tyre track, and a fleeing hare, squirrel or snake leaves its own paw prints
or trail — pressed into the ground in a dark earth tone rather than a black
smear, and fading out after a while. On by default; a new settings toggle
turns it off.

## v0.101.2
The bicycle's carried view actually reads as a bicycle now: the front wheel
was almost dead edge-on to the camera, a flat sliver indistinguishable from
the fork beside it, so nothing about it — tread, spokes, thickness — could
read at all. It now sits at its own fixed angle so the rim opens toward the
rider, a slimmer tyre (it had doubled its own width), a uniform matte tread
instead of a light/dark barcode round the rim, thicker and more contrasty
spokes, no more bright reflector patch (it read as a stuck-on sticker; a
turn now shows straight off the spokes' own sweep), and a longer top-tube
stub that runs off the edge of the view instead of stopping short in mid-air.

## v0.101.1
Geocoding and elevation tiles are cached offline now, the same way the map data
already was: a place looked up once, or a terrain tile fetched once, is served
from IndexedDB on every later visit instead of hitting Nominatim or the AWS
elevation tiles again — the whole loading pipeline (place name → map data →
terrain) is now cache-first, and a place you've built before still works with
the network down. The terrain tile cache is capped and evicts its
least-recently-used tiles past that, so it never grows without bound.

## v0.101.0
The railway is rebuilt. The line now winds through the wood instead of running
straight — it goes round water, off steep ground and away from the hut — and
starts and ends in a tunnel portal, so the train visibly comes out of one hillside
and goes into another. The train is longer (a locomotive and five wagons: coaches,
a boxcar, a log flatcar), the platforms are as long as the train, the cars follow
the bends and slope, lean out of curves and nod under braking, wheels turn, and the
train shows on the minimap. The locomotive is redrawn with windows, a bumper,
buffers, a grille and handrails. It stops at both platforms each way, so it is at
either one often. The quadcopter crate no longer waits for the train to happen to
be seen: the train leaves shortly after the diamond is handed over, and a crate
ordered in an earlier visit is already on the platform. The diamond can be handed
over anywhere on the platform beside the train.

## v0.100.1
The front wheel of the bicycle in your hands now turns with the speed you ride, so
you can see it: it is raised into the frame, the tyre is wider with a chunky
tread and an orange reflector, it runs backward when you back up and stands
still when you stop.

## v0.100.0
A quadcopter. The diamond now goes to the train: give it to the conductor while
the train stands at a platform, and the train leaves a crate at the other end of
the line with a quadcopter in it. R launches it and the view is from the
quadcopter — height, distance, battery, signal and an arrow home on screen —
while you stand on the ground as a little person with a controller, under a tall
orange pole that shows above the trees. R again, or an empty battery, flies it
home. Up to 150 m away, 40 m high, two minutes of battery. How to start and end
a flight is in the H help and the Rules & Quests screen.

## v0.99.0
The railway has stations. Each end of the line now has a platform along the whole
stopped train, with a yellow edge line, a roofed shelter, a bench and a lamp that
lights after dark; nothing grows there. The minimap draws the line and marks both
stops.

## v0.98.0
The fishing rod and the bicycle work in your hands: you fish with the rod you
carry and ride the bicycle you carry (1.6 times faster, everywhere), and after
leaving them at the hut you can take them again with E — the bicycle from its
wall, the rod from inside. Fish now swim in the wood's ponds and streams, in
the shallows where you can reach them from the bank, instead of lying on the
meadow. The rules screen and prompts are updated.

## v0.97.1
Carrying the bicycle now means riding it: you go faster (most on a path), the view
stops swaying like a walk, and there are no footsteps. The fishing rod lying in the
wood can be seen again (it was buried under trails). Fish no longer sprout huge red
spikes for a tail, and a fish you cannot take yet says it needs a fishing rod
instead of ignoring `E`.

## v0.97.0
The quests can be reset. Settings (from the pause menu or the start screen) have
a new Quests row: Reset..., then a confirmation. All five items go back into the
wood and the hut's trophies and the bicycle's wall are forgotten; found
mushrooms, the encyclopedia, settings and the calendar stay.

## v0.96.0
The mine is rebuilt: a wide, tall doorway in a rock outcrop opening onto level
ground, closed rock all the way round, dark inside except for your own lamp,
and walkable in and out with no invisible walls across the trail. The bicycle
you carry now shows its handlebar and front wheel in your view, turning as you
turn, and is left against whichever wall of the hut you stand at, on the real
ground rather than sunk into a slope.

## v0.95.4
The train has wheels now, and no longer merges into a single car at the end of
the line: the whole train stays on the track with its cars apart, stands at a
station with the locomotive in front, and turns round as it leaves.

## v0.95.3
The loading screen no longer freezes. The wood's mushrooms used to be built in
one block that stalled the spinner for up to 20-30 s on a large wood; they are
now built in small slices while the mushroom keeps turning and the bar moves,
the screen stays up until the first frame is drawn, and building them is
about twice as fast.

## v0.95.2
The bicycle now looks like a bicycle. Its wheels stood across the frame like
two loose rings; it is now a side-on diamond-frame bike with spoked wheels,
fork, handlebar, saddle and pedals, in the wood and parked at the shelter.

## v0.95.1
Fixed the mine: the player's own height, and the slope check that gates
forward movement, now follow the cave's own sloped floor once you cross
into it, instead of the real hillside outside — the mine was, for some
worlds, physically unenterable.

## v0.93.0
The minimap, once turned on, now marks the shelter, the mine and the
campfire as fixed landmarks, and — under its own separate, off-by-default
setting — the four fetch-quest items while still hidden in the wood. A new
"Rules & Quests" screen in the pause menu lists how picking and the
encyclopedia work, plus all five quest items, what each unlocks, and
whether it's still out there, in your hands, or already home.

## v0.92.0
The train finally looks like a train. The lead car is a proper diesel
locomotive now — a taller dark body, a cab, an exhaust stack puffing the
same drifting smoke the shelter's chimney already uses, and a real
headlight that switches on at night. Every wagon behind it gets its own
colour and a row of windows that glow amber after dark, instead of every
car being an identical box in one shared colour.

## v0.91.0
A fifth quest item: a diamond, sitting in the wood's own mine — every wood
now has one (the mine's entrance is sited procedurally when no real cave/
adit/mineshaft was surveyed there, the same way the shelter already is),
not only the ones OSM happened to map. Unlike the other four, the diamond
unlocks nothing — it's a trophy that ends up on the shelter's own table once
delivered. The fishing rod and bicycle now leave a trophy of their own too,
the rod leaned by the table and the bike parked outside by the door. The
carried lamp can be switched off and back on with `L`, on top of its usual
automatic day/night/mine rule.

## v0.90.0
Default language is English now, matching how most players will first meet
the game — a fresh save no longer starts in Russian. The title screen also
gets its own RU/EN switch, top-right, so a player doesn't have to start the
game and open settings just to change it.

## v0.89.0
Four more quest items alongside the lost basket: a hatchet, a lamp, a
fishing rod and a bicycle, each placed and delivered the same way, each
unlocking something real once home. The hatchet clears quest-detour scrub,
now real and visible objects instead of bare invisible obstacles. The lamp
lights the player at night and inside mines — mine interiors are genuinely
dark now without it. The rod unlocks catching fish, a new collectible kind
(three real species: perch, roach, pike) that spawn near water. The bicycle
speeds up movement on paths.

## v0.88.1
Fix: the settings menu could push its own language switcher past the
viewport with no way to scroll to it — centering a taller-than-viewport
panel with no overflow handling clips both ends equally. The menu now
scrolls when it doesn't fit.

## v0.88.0
A first quest: a lost basket sits 30-45m from the shelter, with a real pond
or wetland — or, where the wood has none, a generated thicket — standing
between it and home. `E` picks it up and delivers it, same as the shelter
door; a small HUD line tracks the distance while it's active. Mapped water
also blocks movement everywhere now, not just near the quest.

## v0.87.3
Fix: the walking stick vanished a few hundred ms into every touch on real
phones — the canvas never told the browser to keep touch gestures for
itself, so the browser's own pan/zoom recognizer took the drag over and
cancelled it. The stick is also now permanently visible at a fixed spot
instead of only appearing once already being touched.

## v0.87.2
Fix: mushrooms had all but stopped appearing since the calendar update — the
game month was stuck at "January" regardless of the real date, and most
species only grow in spring/autumn. The calendar now starts in the real
month a save began in, and out-of-season species are just rarer now,
never absent outright.

## v0.87.1
Fix: the rails now follow the ground under a slope instead of sitting flat
at one height, detached from their own sleepers.

## v0.87.0
Removed the wind ambience added last release — live feedback called it
naggingly repetitive. Reverted rather than tuned.

## v0.86.0
A synthesized wind bed in the canopy, changing with weather and time of
day instead of dead silence between footsteps and bird calls.

## v0.85.0
A self-running accelerated calendar (1 real hour = 1 game day) now drives
mushroom season and drought instead of the real wall-clock date and a
hardcoded constant.

## v0.84.0
Walking now derives its footstep sound from the (better-sounding) run
recording, slowed down, instead of a separate, worse-sounding clip.

## v0.83.1
The shelter's windows are bigger and their glass is actually translucent
now, instead of a small, fully opaque coloured square.

## v0.83.0
Fix: footstep sound while walking was pure silence (a leading silent gap in
the recording, not a code bug). Fix: broadleaf tree crowns are now scaled
by their real genus size instead of a fixed tiny radius.

## v0.82.1
Fix: a flaky CI perf-guard threshold was blocking the last few deploys.

## v0.82.0
A real oil lamp on the table instead of an unexplained light in mid-air,
and a foundation skirt so light no longer leaks out from under the hut on
uneven ground.

## v0.81.0
The shelter door now has its handle and plank relief on both faces, not
just the inside. Bird calls and the mushroom collect/cut sound are off.

## v0.80.1
Fix: the walk/run footstep sound now retriggers on the actual footfall
instead of running as its own free-running background loop.

## v0.80.0
Real recorded music (day/night/campfire) and a walk/run footstep loop, plus
a new sprint (Shift).

## v0.79.0
A narrow-gauge rail line and a short train shuttling back and forth along
it, running in every wood.

## v0.78.0
A mine/cave interior — a real walkable tunnel, lit by its own lantern —
wherever OSM actually surveyed a cave, adit or mineshaft entrance.

## v0.77.0
Trees near the home plot's own clearing cast a real ground shadow.

## v0.76.0
A short chirp from wherever the nearest bird actually is, panned and
faded by real distance instead of playing from nowhere.

## v0.75.0
Boulders, deadwood, undergrowth, flora and grass now scatter into the
streamed chunks beyond the home plot too.

## v0.74.0
Hares and squirrels now follow the player into the streamed chunks beyond
the home plot, not just inside it.

## v0.73.0
Footsteps: a short synthesized sound per substrate underfoot (leaf litter,
moss, sand, a splash near water), timed off the camera's own walking bob.

## v0.72.0
The world-size picker now hides itself whenever it would have meant
nothing — an empty place field already falls back to the demo wood, size
and all.

## v0.71.0
Real moon phases in the night sky — `world/moonPhase.ts` reads tonight's
actual synodic-month phase from the system clock; the shader moon shows a
real crescent/gibbous terminator instead of a dimmer full disc.

## v0.70.0
The hare and squirrel got a real head instead of ears glued straight onto
the body — the actual fix for "reads as a blob, not an animal."

## v0.69.0
No two mushrooms alike: the cap's lathe-swept radius wobbles by angle and
the stipe leans by height, both growing with age. Measurements that decide
identification (cap/stipe size, gill/ring/volva sizing) stay untouched.

## v0.68.0
Infinite world for the offline/demo wood — chunked terrain, trees and
ecology stream in around the player past the old fixed edge. A named real
place stays bounded, as before.

## v0.67.0
Fixed mouse-look needing an unexplained second click after "Go" — Pointer
Lock is requested where the place-picker's own click actually happens, not
only on the canvas.

## v0.66.0
Fixed the consent screen being unreachable on real mobile browsers — the
overlay now scrolls instead of assuming it always fits the visible viewport.

## v0.65.0
Wildlife (3/3): a wild hive against a tree, bees, and dragonflies over
ponds — a swarm module, separate from the ground-critter state machine.

## v0.64.0
Wildlife (2/3): a snake, reusing the same ground-critter state machine with
a slow "creeps away" instead of a bolt.

## v0.63.0
Wildlife (1/3): a shared ground-critter architecture, plus hares and
squirrels — one state machine instead of five ad hoc systems.

## v0.62.0
A fisherman's hut and a boat at the shore, wherever the wood actually has
water.

## v0.61.0
Furniture inside the hut — a table, a bed, a painting, a cup.

## v0.60.0
Walk into the hut — a working, hinged door.

## v0.59.0
Invert-Y mouse setting.

## v0.58.0
A campfire with a pot and a bench, apart from the hut.

## v0.57.0
Fixed the hut's toy-sized scale, and firewood that poked through its own
wall.

## v0.56.0
LOD for collected finds — a cheap silhouette (a cone on the bounding box,
colour averaged from baked vertex colours) past 18m, real geometry closer.

## v0.55.0
The sound of picking a mushroom — a short synthesized "click" (a noise
burst through a highpass), not a CC0 recording: the same "draw without
pictures" principle, applied to sound.

## v0.54.0
PWA — offline launch and a home-screen icon. The service worker precaches
the current bundle in `install`, rather than passively as requests come in.

## v0.53.0
Portrait layout for the encyclopedia and the species card — a vertical
stack instead of two narrow columns on a phone screen.

## v0.52.0
On-screen buttons for touch devices — encyclopedia, basket review, crouch.

## v0.51.0
Touch controls — a virtual stick for walking, swipe to look around, tapping
a find directly instead of aiming with `E`.

## v0.50.0
The shelter is now sited on a real hut/tower actually marked in OSM, if
this place has one, instead of only procedurally.

## v0.49.0
Fix: berries now grow on a real bush with branches and leaves, not a
cluster of spheres floating in the air — this also fixed the old complaint
"berries can't be picked."

## v0.48.0
The shelter — real window frames, the light leaking from under the floor
fixed, a stack of firewood and a well nearby; a permanent `?debug=1`/`F3`
overlay for live aim debugging.

## v0.47.0
Fix: berries/herbs/finds now aim the same way a mushroom does — an
invisible hitbox sized to the model instead of separate one-off angle code.

## v0.46.0
Fix: an aiming cone for small finds; trees no longer grow over paths.

## v0.45.0
Forest-floor litter — noisy patches of dark earth instead of a flat fill.

## v0.44.0
Fix: the aiming cone for small finds was blocked by any blade of grass on
the ray.

## v0.43.0
Export the encyclopedia as an image — a grid of found species, a plain PNG
download.

## v0.42.0
Your own notes on a find — where you found it, what you remember, in
"Basket review."

## v0.41.0
Terrain for dunes and bog — ridges and hummocks, not just the colour of the
ground.

## v0.40.0
Streams, waterfalls and springs — a ribbon along the streambed, not one
flat panel.

## v0.39.0
Birds — takeoff, flight, landing, ground fidgeting; the last big port from
race-the-city.

## v0.38.0
A minimap — off by default, the compass stays the main way to orient.

## v0.37.0
Conifer trees — their own crown per genus, not one cone for all of them.

## v0.36.0
A permanent controls hint (`H`) while walking.

## v0.35.0
The version number on the title screen; three live fixes in a row (the
mouse returning after inspection, camera jitter, the shelter's corners).

## v0.34.0
Camera bob and footstep rhythm; fixes for `E` on small finds and paths past
the edge of the plot.

## v0.33.0
The shelter — windows, a door, a smoking chimney, light at night, chunkier
walls.

## v0.32.0
Undergrowth grows in patches, not an even lawn.

## v0.31.0
Half-fallen trees.

## v0.30.0
Jump onto a boulder, stump or a thin log, if the height allows it.

## v0.29.0
A mark of disturbed litter where something was picked.

## v0.28.0
The basket in 3D — preview cards of the real specimens instead of counters.

## v0.27.0
A loading screen — a spinning mushroom and a progress bar by loading stage.

## v0.26.0
Finds — the fifth and last `kind` of forest finds (a bird's nest, an
antler, a stone).

## v0.25.0
Nuts — the fourth `kind` (hazelnut, acorn).

## v0.24.0
Herbs — the third `kind` (nettle, ramsons, sorrel).

## v0.23.0
Cloudberry — the fourth berry, the only one on the bog.

## v0.22.0
Berries — the second collectible `kind`; `Species` became a discriminated
union by `kind` instead of mushrooms only.

## v0.21.0
A settings button in the corner of the screen; perch points on trees for
future birds.

## v0.20.0
A flashlight on `F`.

## v0.19.0
Weather — rain, snow, fog.

## v0.18.0
Dunes and bog — ground colour and walking physics; cut a mushroom, not just
pick it.

## v0.17.0
The version number in the corner of the screen; `Esc` exits to the menu.

## v0.16.0
A day/night change — day/night/cycle modes.

## v0.15.0
A settings menu — walking speed, mouse sensitivity, draw distance,
language.

## v0.14.0
Water bodies — a surface, a skirt along the bank, a moisture source for
ecology.

## v0.13.0
Paths — an earthen ribbon along OSM ways.

## v0.12.0
Clouds, drifting over the wood.

## v0.11.0
The sky — a dome with a gradient, a sun and stars instead of a flat fill.

## v0.10.0
A mushroom hides behind grass and undergrowth from the aim, not just from
the eye.

## v0.9.0
Grass — thicker in damp low ground.

## v0.8.0
Plot size is configurable on the place-picker screen; encyclopedia filters
— biome, edibility, hymenophore, season.

## v0.7.0
Random pits and hollows in the terrain; clearings and glades inside the
wood.

## v0.6.0
A list of known woods on the place-picker screen; a champignon fairy ring;
the shelter (first version — the player's starting point); flowers, fern,
shrub.

## v0.5.0
A slope slows the climb, a jump, a compass, an honest choice of starting
point, tree-crown shapes, deadwood, boulders.

## v0.4.0
The species database expanded from 3 to 25 — morel, false morel, milk-cap,
orange birch bolete, false chanterelle and others.

## v0.3.0
Real geography — plan 2 is done: the wood is built from a real place via
OpenStreetMap and AWS Terrain Tiles, with an offline demo wood as an honest
fallback.

## v0.2.0
A whole playable slice — plan 1 is done (tasks 1-17).

## v0.1.0
The first playable version — tasks 1-6.
