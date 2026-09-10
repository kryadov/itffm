# A railway through the wood — design

Date: 2026-09-10
Status: approved, in implementation. Low priority.

## 0. Why

The wood is quiet in a way that is mostly right — but it has no sign that
anyone else exists past its edge. A narrow-gauge line with a short train
passing now and then is exactly that sign, and it gives a walker a landmark
that moves: you hear and see it from far off, and it tells you where the line
runs.

`race-the-city` has trains: station platforms, level crossings, three train
classes on a real city network. Per `CLAUDE.md`'s donor rule, almost none of
it applies — a wood is not a rail network.

## 1. Decisions

| Decision | Why |
|---|---|
| One straight narrow-gauge line (`RAIL_GAUGE` 0.7 m — forest-logging scale), spanning most of the plot (`SPAN_FRAC` 0.9) | The smallest thing that reads as a railway. Bends, points and sidings are a network's problems. |
| Offset from the middle by 55–80% of the half-size, never through the hut's clearing | The player starts at the hut; a train through the front yard is a joke, a train glimpsed through the trees is a place. |
| Ground-following: the line is sampled at points along its length and `railHeightAt(line, x)` interpolates between them | Sleepers and train sit on the ground, not on a flat plane through it. |
| A **dead-end shuttle**, not a loop: `stepTrainT` advances along the line and bounces off either end | No turning loop to place, no points to model; the train goes away and comes back. |
| A short train: three cars (`CAR_COUNT`), 2 m each, at `TRAIN_SPEED` 2.5 m/s, colours picked per seed from a small palette | Small enough to sit inside a narrow-gauge look; slow enough to read. |
| Runs in every wood, demo or real place, unconditionally | Unlike the mine, it needs no survey data to mean something. |
| Rails, sleepers and the train are a handful of meshes in one group (`buildRailMesh`, `createTrain`) | Two rails, one instanced sleeper mesh, one group per car. |

## 2. Out of scope

- Stations, crossings, a timetable, stopping.
- A real locomotive model — the cars are boxes for now.
- Continuing the line into streamed chunks of the infinite demo wood.
- Trees keeping off the line.

## 3. Testing

- `placeRailLine`: deterministic; different per seed; spans most of the plot
  within bounds; offset from the centre; follows the real ground at each
  point.
- `railHeightAt`: exact at an endpoint; interpolates on a slope.
- `stepTrainT`: advances forward; bounces off the far end and the near end.
- `createTrain`: one named group; every car finite after a long run; never
  past either end; same seed, same colour; disposes cleanly.
- Look at it: sleepers receding in perspective with a car down the line; a
  closer pass on one car. Temporary scene-exposure and teleport hooks only,
  reverted before the commit.
