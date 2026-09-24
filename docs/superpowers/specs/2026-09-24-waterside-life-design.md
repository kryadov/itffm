# Life at the water: real fish, reeds, a rowing boat — design

Date: 2026-09-24
Status: approved with the owner (part of the 12-item batch of 2026-09-24),
in implementation.
Builds on: `2026-09-20-items-in-hand-design.md` (fish in the water, the rod in
hand) and `2026-09-09-shelter-and-camp-design.md` (the fisherman's shack and
boat).

## 0. Why

Since fish moved into the water, the water is where the player looks — and
what is there does not hold up:

- A fish is a stretched egg with two cones. Perch, roach and pike are one
  shape in three colours; the field marks that tell them apart are absent.
- Fish lie still on the surface like leaves.
- A pond's edge is a clean line between grass and water. Real banks are reed
  beds.
- The boat is a solid pointed slab with two sticks on top.

## 1. Decisions

### Fish

| Decision | Why |
|---|---|
| A fish is built like a fish: a countershaded body (dark back, pale belly) with a blunt head and a narrow tail stalk, a **forked** tail, one or two dorsal fins, an anal fin, paired pectoral and pelvic fins, two eyes near the head | Countershading and fins are what make a fish shape read at a glance, even small. |
| New **optional** `FishMorphology` fields: `bodyDepth`, `pattern` (with `patternColor`), `eyeColor`, `lowerFinColor`, `dorsalFins` (1 or 2), `dorsalAt` | Optional so existing fish data keeps loading. The fields are exactly the marks a guide uses: the pike long with pale spots and its dorsal far back, the perch barred with two dorsals and red lower fins, the roach silver with a red eye. |
| `toWorldMesh` keeps each part's own vertex colours instead of flattening them | It used to paint a part one colour, which erased the back/belly split the moment a fish entered the world. |
| Proportions stay sane: longer than tall or wide, no fin past the body by more than a fraction of its length, the tail flat and on the tapered end, the dorsal on top | The tail once came out a metre-wide red spike on the blunt end. |

### Swimming

| Decision | Why |
|---|---|
| Each fish loops an ellipse of its own round where it was placed, **head first**, its pace breathing between a glide and a near-hover, its body swinging with the tail beat (`fish/swim.ts`'s `swimPose(home, t)`, pure) | Pure in time, so deterministic and cheap; a breathing pace reads as alive where a constant one reads as a conveyor. |
| The room a fish swims in is measured at spawn (`fishSpawn` gives each a `roam`): all of it water and, in a pond, all within reach of the bank; never more than `SWIM_MAX_ROAM` | A fish must never swim out of reach of the rod, or onto land. With no room it stays put, turning a little. |
| A stream fish follows the surface down its channel | A stream's surface slopes; a fish at one height would sink or fly. |
| `&tp=fish` stands on the bank 2 m from the first fish | Looking at a fish headless is otherwise a search. |

### Reeds

| Decision | Why |
|---|---|
| Cattails with brown heads and long arching leaves (`world/reeds.ts`), in **beds** with bare bank between (`BED_LENGTH` 5 m, a chance per bed) — not an even hedge | Reeds grow in stands. |
| Around a pond they follow the waterline that **actually shows**, a little into the shallows (`REED_REACH_INTO_WATER` 1 m) and onto the wet margin (`REED_REACH_ONTO_LAND` 0.5 m) | A pond floats at its lowest bank point, so on a slope its water starts metres inside the OSM outline; reeds on the outline would stand on dry grass. |
| Along a stream they keep to both banks, off the channel | — |
| Kept clear of the fishing shack and its boat | Nobody launches a boat through cattails. |
| Instanced (stems, leaves, heads — three draw calls), capped at `MAX_CLUMPS`, culled with the rest of the static scatter | The same arithmetic as everything else. |

### The boat

| Decision | Why |
|---|---|
| A hollow planked hull whose sheer sweeps up to a pointed bow and a flat transom; tarred strakes below, painted above, each plank its own shade with a crease at the seam, bare wood inside, a dark gunwale | A rowing boat, recognisable from the shore. |
| Three thwarts fitted to the planking's curve, floorboards, a pair of oars laid in | What makes it a boat someone uses. |

### Also in this batch

| Decision | Why |
|---|---|
| Crouch is a **toggle** on `Ctrl` or `C` — one press down, the next up; you can walk crouched; getting on the bicycle stands you up; the touch button toggles too and stays lit | Holding `Ctrl` while walking turned `W` into `Ctrl+W` — the browser closed the tab. The help text had also said `Shift` crouches; it runs. |

## 2. Out of scope

- Fish that react to the player.
- Fish in streamed chunks.
- Rowing the boat.

## 3. Testing

- `buildFish`: deterministic; a body, tail and dorsal; sane proportions;
  grows with age within the species range; no fin far past the body; a flat
  tail on the tapered end; the dorsal on top; darker back than belly; bars
  only on a barred fish; eyes and paired fins; a second dorsal only when the
  species has one; eyes near the head; a forked tail; deeper-bodied when the
  species is; flattened into a world mesh keeping its colours.
- `swimPose`: deterministic; never leaves its circle; covers real ground;
  head first; stays put with no room; the roam cap.
- `fishSpawn`: room to swim stays in the water and within reach; stream fish
  stay in the channel.
- `placeReeds`: deterministic; along the bank, not mid-pond; in beds with
  gaps; the visible shoreline on a slope; standing on the bed, clear of the
  surface; a stream's banks; room left for the shack and boat; nothing
  without water. `buildReedMesh`: one named group of instanced parts.
- Boat: a boat not a barrel; hollow; rising at bow and stern, pointed only at
  the bow; planking in more than one colour; thwarts and oars.
- `nextCrouch`: flips on each fresh press, ignores key repeat and other keys,
  answers to either Ctrl and to C.
- Look at it: `&tp=fish`, a reed-lined pond on a slope, the boat from the
  bank.
