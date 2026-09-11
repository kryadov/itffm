# TODO / Идеи

Копилка того, что впереди. Сделанное живёт в тегах и релизах (v0.1.0 … текущий),
здесь — что дальше. Порядок внутри разделов: сначала то, что чинит уже
обещанное, потом новое.

Планы с конкретикой лежат отдельно: [`docs/superpowers/plans`](docs/superpowers/plans/),
обоснования решений — в [`docs/superpowers/specs`](docs/superpowers/specs/).

---

## 🐞 Живой репорт 2026-09-11

Брейншторм прошёл в чате (не отдельный design-документ — 11 живых репортов,
каждый с решением, плюс несколько старых открытых пунктов ниже, которые
оказались тем же классом работы). Порядок: сначала баги, потом перф, потом
UX/фичи покрупнее.

- [x] **Лампа на столе вместо света ниоткуда; протечка света из-под дома
      на неровном участке.** Два живых репорта подряд. Первый: свет в
      домике шёл от `hearthLight` — `PointLight`, стоявшего в буквальном
      смысле в центре комнаты в воздухе, без какого-либо видимого
      источника (комментарий в коде называл его "hearth", но самого очага
      внутри домика никогда не было — костёр снаружи, отдельная сущность).
      Заменено настоящей масляной лампой на столе (`world/shelter.ts`'s
      `lamp` — основание, стойка, абажур с `emissive`-свечением, лампочка
      как `PointLight` внутри абажура) — тот же приём, что уже красит окна
      по ночам. Второй репорт, тем же заходом: на неровном участке часть
      стен не касалась земли (весь домик — жёсткая коробка на одной Y-
      координате `Shelter.y`, взятой ОДНИМ замером высоты в центре
      footprint'а 3.6×3.1м; на реальном рельефе угол может быть заметно
      ниже центра) — и в эту щель светило что угодно внутри, включая новую
      лампу. Настоящего конформного рельефу фундамента не делали (это
      отдельная, более крупная задача — сэмплировать землю под каждым
      углом), пошли на честный ограниченный компромисс: стены и пол,
      которые касаются земли, продлены на `FOUNDATION_DEPTH` (0.8м) ниже
      origin домика — цоколь, поглощающий обычный локальный перепад, не
      гарантия на любом склоне. Закреплено тестами (обе стороны двери уже
      были тестом с прошлого репорта; новый тест проверяет, что стены и
      пол реально уходят на `FOUNDATION_DEPTH` вниз). `npm test`/`build`/
      `boot-check` зелёные.
- [x] **Дверь — ручка и рейки только с одной стороны (изнутри).** Живой
      репорт: подошёл к двери снаружи — гладкая доска без ручки, не читается
      как дверь, пока не зайдёшь. Корень был в буквальном смысле
      геометрический: `world/shelter.ts`'s `doorHinge` ставил обе рейки
      (`groove`) и ручку (`handle`) только на `z=+0.035`/`+0.05` — одна
      сторона 0.06-толщины полотна, та, что смотрит внутрь землянки.
      Снаружи игрок видел ровно противоположную, ничем не украшенную грань
      того же `BoxGeometry`. Исправлено зеркальным дублированием — те же
      рейки и ручка теперь стоят и на `z=-0.035`/`-0.05`, симметрично с двух
      сторон полотна. Закреплено новым тестом (`doorHinge`'s дети содержат
      и положительные, и отрицательные `z`), `npm test`/`build`/
      `boot-check` зелёные.
- [x] **Отключить звук крика птицы и звук сбора/среза гриба.** Живой запрос.
      И то, и другое — не баг, решение вкуса: убраны вызовы `audio.collect()`
      (оба места — в корзину и срез без сбора) и вся таймерная обвязка
      `audio.birdCall()` из `main.ts` (сам таймер `birdCallTimer`,
      `birdCallRand`, константы `BIRD_CALL_MIN_GAP`/`MAX_GAP`/`RADIUS` и
      импорты `birdPan`/`birdGain`/`nearestBird` — иначе висели бы мёртвым
      кодом под `noUnusedLocals`). Птицы по-прежнему летают и садятся
      (`world/birds.ts` не тронут) — просто без звука. Сами методы
      `AudioEngine.collect()`/`birdCall()` оставлены нетронутыми (часть API,
      покрыты `test/audio/audio.test.ts`) — на случай, если вкус ещё
      поменяется, включить обратно — это просто вернуть вызовы, не писать
      логику заново.
- [x] **Дверь землянки — видимая стена-невидимка в проёме, зайти нельзя.**
      Done. Neither hypothesis in the original note held: `WIDTH`/`wallHeight`
      hadn't moved since v0.60.0, and `game/worldStream.ts`'s chunk collision
      never touches the shelter at all (it only owns the streamed wilderness
      beyond the home plot; `game/scene.ts` wires `wallObstacles`/
      `doorObstacle` into `extraObstacles` correctly). The real bug was in
      `game/player.ts`'s `stepPlayer`: `toggleDoor()` opens the door by
      zeroing the shared `doorObstacle`'s radius rather than removing it from
      the obstacle list, but the collision loop still computed
      `min = o.radius + PLAYER_RADIUS` for it — so an "open" door was still a
      solid point 0.3m (`PLAYER_RADIUS`) across. A player aiming for the
      middle of the doorway (exactly what a real doorway invites) walked
      straight into that point and got pinned just short of it, reading as an
      invisible wall in a visibly open door. Fixed by skipping any obstacle
      with `radius <= 0` outright — a zero radius now means no obstacle, not
      a point-sized one. New failing-first test in `test/game/player.test.ts`
      ("does not block movement through a zero-radius obstacle"); the
      existing `test/world/shelter.test.ts` integration test still covers the
      closed-door case. Verified live: a headless-Chrome run (temporary
      `?__DOORWALK` teleport hook, reverted before commit, `git diff` on
      `main.ts` clean) walked the player from outside the door dead-centre
      through the open doorway and screenshotted it standing just inside,
      looking back out at the open door and the wood beyond.
- [ ] **Загадочный звук каждые 10-15с, не похож на природу, идёт даже когда
      игрок стоит.** Не птичий крик (`audio/birdCalls.ts`, интервал 4-11с) —
      что-то ещё держит собственный таймер в `audio/` или `game/`, найти
      источник.
      Checked (2026-09-11), no fix: traced every place in the codebase that
      can make a sound. `AudioEngine` (`audio/audio.ts`) has exactly three
      call sites, all in `main.ts` — `collect()` (action-gated, only on
      pick/cut, not periodic), `footstep()` (gated on `crossedFootstep`
      against `PlayerState.bobPhase`; `stepPlayer()` in `game/player.ts`
      only advances `bobPhase` by ground distance actually covered while
      grounded, so it provably cannot fire while the player stands still),
      and `birdCall()` (`main.ts`'s own `birdCallTimer`, 4-11s — already
      ruled out above). No `setInterval`/`setTimeout` anywhere in `src/`.
      None of `world/insects.ts`, `world/critters.ts`, `world/weather.ts`,
      `world/campfire.ts`, `world/shelter.ts` import `audio/` or reference
      sound at all, despite each holding its own `+= dt` timer for visuals.
      One thing worth checking live before ruling birdCall out for good:
      `birdCallTimer` resets to a fresh random 4-11s wait even on a miss
      (no bird within `BIRD_CALL_RADIUS` of the player) — with only 8 birds
      over a 90-180m half-size wood, misses are common, so the real gap
      between *audible* calls can silently run well past the advertised
      4-11s. Next pass: log actual call timestamps in a live session rather
      than reasoning from the static range in the comment.
- [x] **Поезд не появляется.** Root cause found: `placeRailLine`
      (`world/railway.ts`) sampled ground height at a fixed 12 points
      regardless of the line's own length (up to ~270m for the "large" plot
      size) and interpolated between them — on real procedural terrain that
      let the interpolated line stray up to ~0.9m from the actual ground
      between samples (measured directly; see the new
      `test/world/railway.test.ts` regression test). Against an 8cm rail
      (`RAIL_HEIGHT`) and a ~1m-tall train, that is enough to bury the train
      under the terrain mesh over most of its run — not a timing bug, the
      shuttle (`stepTrainT`) and the per-frame `forest.updateTrain(dt)` call
      in `main.ts` were both already correct and un-gated by player position.
      Fixed: `placeRailLine` now samples every 3m by distance
      (`RAIL_STEP`), the same "dense enough to follow the ground" approach
      `world/paths.ts`'s `RIBBON_STEP`/`densify` already use, instead of a
      fixed segment count — brings the worst-case error on real terrain
      under 0.2m. Trees growing through the rails: fixed the same way as
      paths — `placeOsmTrees` (`world/osmTrees.ts`) now takes the rail line
      and applies `RAIL_CLEARANCE` via the same `distanceToPolyline` used for
      `PATH_CLEARANCE`; `game/loadForest.ts` sites the line once (before
      trees) and threads it through `ForestSource.railLine` so
      `game/scene.ts` reuses the exact same line instead of siting a second
      one. Deferred, honestly: continuing the rail line seamlessly into
      streamed chunks (`game/worldStream.ts`) is the same halfSize-vs-
      chunk-grid work the open "Real-place chunking" item below already
      flags — not attempted here. Also pre-existing and out of scope: no
      scatter placer other than `placeOsmTrees` (boulders/undergrowth/flora/
      deadwood) avoids paths OR the rail line at all — a broader gap than
      this rail-specific report, left alone rather than expanded into a
      general clearance pass. Verified: new tests in
      `test/world/railway.test.ts` (ground-following error bound, across
      several seeds/plot sizes) and `test/world/osmTrees.test.ts` (rail
      corridor), `npm test` (722 tests) and `npm run build` green,
      `npm run boot-check` OK, and a throwaway headless-Chrome render of the
      real procedural terrain + rail mesh + train (built, screenshotted,
      then deleted — not part of the repo) showing sleepers following the
      ground's own bumps and the train sitting visibly on the rails, not
      sunk into the terrain.
- [x] **Швы между чанками карты видны.** Done — two separate root causes,
      found by reproducing the seam numerically before touching anything
      (sampling both neighbours' own coordinate frames at the shared edge
      and asserting they agree): (1) **Colour.** `world/ground.ts`'s
      `litterColor()` folds its `seed` argument straight into `fbm2` — not
      as an offset within one continuous field, but as the hash seed of an
      entirely different, uncorrelated noise field. `game/worldStream.ts`'s
      `buildChunk` was passing each chunk's own `chunkSeed(coord,
      globalSeed)` as that argument, so the litter pattern jumped at every
      single streamed-chunk border (and at the home-plot border too) even
      though the underlying world (x, z) coordinates lined up exactly.
      Fixed by passing one shared `globalSeed + 17` everywhere — the same
      convention `game/scene.ts`'s home plot already used — so the colour
      field is one continuous surface over the whole world, the way height
      already was. (2) **Geometry/height, home-plot border specifically.**
      The reserved home chunk (0, 0) built its own ground mesh through a
      completely separate path (`game/loadForest.ts`'s `proceduralGround`
      → `game/scene.ts`'s `createForest`) at `groundSegmentsFor(200)` = 220
      segments, while every streamed neighbour chunk
      (`game/worldStream.ts`) built at `CHUNK_GROUND_SEGMENTS` = 60 — two
      independently-tessellated meshes at different vertex spacings sharing
      one edge, a real crack (T-junction) regardless of how well the
      height *values* agreed. Fixed by threading the streamed chunks' own
      resolution into the home plot's mesh whenever it neighbours them:
      `createForest` (`game/scene.ts`) and `proceduralGround`
      (`game/loadForest.ts`) both gained an optional `groundSegments`
      override, `loadForestData`'s `LoadResult` now reports which
      resolution it actually built at, and the demo-wood branch passes
      `CHUNK_GROUND_SEGMENTS` (moved to `world/chunking.ts` so both call
      sites share the one constant) through `main.ts` to `createForest`. A
      real, bounded place still keeps its own finer
      `groundSegmentsFor(halfSize)` — it never streams, so nothing borders
      it. Verified: two new `worldStream.test.ts` tests assert every
      vertex on the shared edge between two loaded streamed chunks matches
      in both height and colour (the colour one reproduced the bug first,
      red before the fix); a new `loadForest.test.ts` test asserts the demo
      wood's `groundSegments` actually equals `CHUNK_GROUND_SEGMENTS`; and a
      live headless screenshot with a temporary teleport to the home-plot/
      streamed-chunk boundary (TEMP DEBUG, reverted, `git diff` empty
      before commit) shows a mushroom and undergrowth sitting naturally
      across the seam — smooth ground, no crack, no colour band.
- [ ] **Real-place (настоящая локация) — бесконечный мир не работает,
      игрок упирается в край загруженной области.** Это открытый пункт
      «Real-place chunking» из раздела «Infinite world» ниже — то же самое,
      просто живой репорт подтвердил, что баг реален и заметен. Постепенная
      подгрузка через Overpass/DEM по чанку вокруг игрока, с честным
      процедурным fallback на чанк при любой сетевой неудаче — решение уже
      есть в доке, реализация — нет.
- [x] **Disclaimer убран целиком** — экран с правилами не проходим на
      мобильных (не почёлся кнопке), чинить в очередной раз не стали.
      Убрать экран согласия из `main.ts` полностью (первый запуск и кнопка
      в HUD/энциклопедии), не оставляя even урезанной версии. `CLAUDE.md`
      уже обновлён (раздел «Responsibility» больше не требует disclaimer).
      **Done:** removed `showDisclaimer()`, its first-run call, and the
      `overlay('disclaimer', ...)` markup from `main.ts`; removed the
      permanent disclaimer banner from `ui/encyclopedia.ts` (no button ever
      reopened a separate disclaimer screen — the encyclopedia's own inline
      banner was the only other place it showed). Deleted the now-dead
      `disclaimerSeen` field from `SaveData` (`save/store.ts`, plus its
      `emptySave()`/tests), and the now-unused `disclaimer`/`understood`
      i18n keys (`i18n/i18n.ts`, both RU and EN) — `controls` stays, since
      the `H` help overlay still uses it. Updated `scripts/shot-cdp.mjs`'s
      click script, which used to dismiss the disclaimer for screenshots.
      Verified: `npm test` (720 tests) and `npm run build` green, `npm run
      boot-check` OK, and a live headless CDP screenshot after picking the
      demo place shows gameplay directly — no disclaimer screen at any
      point.
- [ ] **Просадки FPS и 100% загрузка GPU/CPU, дрожание теней, когда игрок
      стоит на месте.** И постоянная нагрузка, и рывки при ходьбе (похоже на
      подгрузку чанков) — пользователь играет на RTX, значит дело не в
      слабом железе. Разобраться и почистить ПЕРЕД тем, как добавлять новые
      тени (см. «Тени для игрока/травы/…» ниже) — иначе тени лягут поверх
      уже сломанного перфоманса. См. также старые открытые пункты
      «Инстансинг грибов», «…но БЕЗ отсечения по дальности», «Бюджет
      производительности», «Chunk build cost» ниже — тот же класс работы,
      берутся в этот же заход. **Partially addressed this session** (see
      those four sub-items below for what actually changed): real distance
      culling for static scatter and a real slicing of chunk-build cost are
      both done, with tests. Still open and NOT addressed by this pass:
      the "постоянная нагрузка, когда игрок стоит на месте" (constant load
      while standing still) and the shadow jitter specifically — without a
      real GPU to profile against (only headless SwiftShader, which does not
      port perf numbers across GPU classes for GPU-bound work — see the
      tree-shadow entry above), there was nothing concrete in the render
      loop to point at as a per-frame CPU cost while idle (no code runs an
      unbounded loop or rebuilds a buffer every frame just from standing
      still, checked directly). The shadow jitter is most likely inherent
      PCF shadow-map sampling noise (`sun.shadow.mapSize` is a modest 1024,
      `game/scene.ts`) rather than a bug — a real device is the only way to
      tell noise from a bug here, the same class of gap as the tree-shadow
      entry above.
- [ ] **Тени только у деревьев (частично) — игрок, трава, кусты, камни,
      дом, животные, птицы тени не отбрасывают.** После перфоманса выше.
      Решено идти на компромисс, знакомый по деревьям
      (`shadowRadius`-ограничение) — не все 1500+ объектов сразу, точечно и
      измеримо.
- [x] **Шаги звучат плохо** — громко и неатмосферно. Готово: rebalanced only
      the synthesis in `audio/audio.ts`'s `footstep()` — trigger mechanism
      (`audio/footsteps.ts`) untouched. Peak gain dropped to 0.14-0.22 (was
      0.32-0.5, `collect()`'s own one-off gain is 0.9 — footsteps repeat
      ~twice a second while walking, so they need to sit far below a rare
      event's loudness or the ear fatigues). Filters moved from low/high-Q
      lowpass/bandpass to a narrower bandpass (Q 1.0-1.3, was 0.4-0.8) for
      litter/moss/sand — a higher Q narrows the passband, which is what
      turns broadband noise (reads as hiss) into a resonant "tap" (reads as
      a footfall); water kept a narrow-Q lowpass so its broadband splash
      survives. Duration down to 0.04-0.06s (was 0.05-0.09s) for a tighter,
      more percussive decay. `FOOTSTEP_PARAMS` exported from `audio.ts` so
      `test/audio/audio.test.ts` can assert the bounds (peak gain, Q,
      duration, frequency range) without an `AudioContext` — no test in
      `test/audio/` mocks one, only pure helpers are exercised. Honest
      caveat, same voice as this file's other not-runtime-testable entries:
      whether it actually *sounds* better is a judgment call verified by
      ear/playing the game, not provable by a unit test.
- [x] **Звук воды** — генерируем синтезом (тем же приёмом, что и остальной
      звук игры, не CC0-запись) — журчание ручья/тишина у пруда, слышно
      раньше, чем видно, громче вблизи. Фон леса (ветер/скрип) — НЕ в этом
      заходе, пользователь пришлёт свой референс отдельно. Done — see the
      matching "Вода" item in "🔊 Звук" below for the implementation.
- [x] **Меню/ESC переработать.** Done. `Escape` in `main.ts` now opens
      `openPauseMenu()` — a plain `overlay()` (the same helper every other
      screen already uses) with five buttons: Continue (closes the menu),
      Settings, Change location, Encyclopedia and Basket. None of them
      duplicate logic — Settings calls the existing `openSettings()`
      (`ui/settingsMenu.ts`), Encyclopedia and Basket call the same
      `openEncyclopedia()`/`showTally()` the `Tab`/`Q` hotkeys already call,
      and Change location just does `location.reload()`, the same full
      restart `openExitConfirm()`'s own "Leave" button already performs —
      which lands back on `openPlacePicker()` (`ui/placePicker.ts`)
      unchanged. A second `Escape` while the pause menu is open calls
      `openExitConfirm()` itself, verbatim — it now guards against a
      duplicate overlay so cancelling ("Stay") leaves a pause menu that still
      responds to a further `Escape`. The HUD's settings gear
      (`ui/hud.ts`) now opens this same pause menu instead of jumping
      straight to settings — touch has no physical Escape key, so this was
      the only way to give it "change location" at all; its tooltip changed
      from "Settings — M" to "Menu — Esc" to match. Two new i18n keys
      (`pauseTitle`, `pauseContinue`, `pauseChangeLocation`) in both
      languages. Verified: `npm test` (726 tests) and `npm run build` green;
      `npm run boot-check` OK; a scripted headless-Chrome sequence confirmed
      first `Escape` opens `#pauseMenu` (not `#exitConfirm`), the five
      buttons render as expected, clicking Continue removes the menu and
      returns to gameplay, and a second `Escape` opens `#exitConfirm` on top
      of the still-open pause menu — screenshots looked at directly, not
      just the DOM assertions.
- [x] **Дом и дверь ещё крупнее.** Done, same pass as the door-collision fix
      above. `world/shelter.ts`'s `WIDTH` 3.0→3.6m, `DEPTH` 2.6→3.1m,
      `WALL_HEIGHT` 2.3→2.6m, `DOOR_WIDTH` 0.95→1.1m, `DOOR_HEIGHT` 2.0→2.2m
      — a further ~15-20% step past the v0.48.0/v0.60.0 sizes. `SHELTER_RADIUS`
      grew 2.1→2.5m the same way the v0.60.0 fix derived it: the box's own
      half-diagonal at the new dimensions (~2.38m) plus a margin, not a blind
      multiply. Interior furniture (`BED_X`/`TABLE_X`/painting position) and
      the roof span are all formulas off `WIDTH`/`DEPTH` already, so they
      stayed in proportion without their own edit — confirmed by the existing
      `buildShelterMesh` furniture tests and the door-walk screenshot above,
      nothing clips through the bigger walls. `test/world/shelter.test.ts`'s
      door-walk integration test had two hardcoded z-bounds tied to the old
      `DEPTH`; updated to the new doorway position (`-DEPTH/2` = -1.55).

### Старые открытые пункты, взятые в этот же заход

- [ ] **Инстансинг грибов одного вида.** Решено (2026-09-11): идти на
      компромисс несколько готовых форм на вид, как у деревьев
      (`CONIFER_SHAPES`/`BROADLEAF_CROWNS`), а не честное «нет двух
      одинаковых» — реальный выигрыш в draw calls важнее. См. полное
      обоснование компромисса в «🔧 Внутреннее» ниже. **Still not
      implemented** — this stays a design decision to make with the user
      (finite shape set vs. true "no two mushrooms alike"), not something to
      code solo; not touched this session, per that same note.
- [x] **Culling дальней сцены по-настоящему**, не только туман — см. «…но БЕЗ
      отсечения по дальности» в «🌲 Наполнение леса» ниже. Готово — see that
      entry for the actual fix (`world/instanceCulling.ts`).
- [ ] **Бюджет производительности на мобильных** — см. одноимённый пункт в
      «📱 Мобильные устройства» ниже. Still genuinely blocked on a real
      device — see that entry for what this session's culling/chunk-build
      work does and does not give it for free.
- [x] **Chunk build cost** — фриз при подгрузке чанка, см. «Chunk build cost
      is still a real…» в «🗺️ Infinite world» ниже; пересекается с «Просадки
      FPS» выше. Partially done — see that entry: the dominant cost (a
      chunk's own placement construction) is now sliced across several
      frames; the terrain/trees/scatter half of a chunk build is not.

### Дизайн-решения, принятые в брейншторме 2026-09-11 (своя работа, в очередь)

- [ ] **Сезоны/календарь.** Решено: игровой календарь идёт сам, ускоренно —
      1 реальный час = 1 игровые сутки. `season` перестаёт быть статичным
      фильтром, `ecology/spawn.ts`'s `daysSinceRain` начинает жить от
      игрового времени, а не константы `2`; видимая погода
      (`world/weather.ts`) вяжется на то же значение, что двигает спавn —
      закрывает заодно и «Погода как выбор игрока» ниже в «🌤 Атмосфера».
- [ ] **Дюнный гриб (*Peziza ammophila*) и трюфель — новая схема тела.**
      Решено: делаем оба. Новый `kind: 'cup'` (асковый, чашевидный гриб без
      привычной ножки — сама Peziza) и новый `kind: 'hypogeous'`
      (подземный, без открытой поверхности со спорами вовсе — трюфель и
      родственные), плюс для `hypogeous` — отдельный интерфейс поиска по
      запаху вместо прицела с `E` (собака/свинья ищут нюхом в природе;
      игровой аналог — растущая по приближению звуковая/визуальная
      подсказка, не «подошёл — видишь»).

---

- [x] **Тропинка уходит за пределы карты.** Готово: `buildPathMeshes`
      (`world/paths.ts`) получил `halfSize` и режет полилинию там, где она
      покидает участок, вместо того чтобы тянуть ленту до точки далеко за
      пределами меша земли.
- [x] **`E` не работает на ягодах и прочих некрупных находках.** Готово:
      подтвердилась гипотеза про масштаб (миллиметровые объекты против
      8-30 см шляпки) — `nearestInView` (`game/pick.ts`) получил прощающий
      конус для помеченных `Forest.smallObjects` (любой не-`mushroom`
      `kind`) как запасной проход, когда точный луч ничего не задел.
- [x] **Тот же конус на практике почти никогда не срабатывал для ягод.**
      Готово (v0.44.0…v0.46.0), два живых баг-репорта подряд. Первый:
      «с грибами всё работает, а на ягоды надпись не появляется» —
      точный луч, задевший ЛЮБОЙ окклюдер (травинку/куст) без находки за
      ним, возвращал `null` и никогда не пробовал конус; v0.44.0 добавил
      компромисс «пробовать конус, только если ВООБЩЕ никакой настоящей
      находки нет на всём луче». **Этого всё равно оказалось
      недостаточно** — второй живой репорт после v0.45.0 показал, что
      почти все ягоды по-прежнему не находятся, кроме одной случайной.
      Причина глубже: `clustered`-колония (`ecology/spawn.ts`'s
      COLONY_SPREAD) сажает несколько настоящих экземпляров в
      сантиметрах друг от друга — луч почти всегда задевает КАКОЙ-ТО
      другой экземпляр той же куртины (настоящую находку, просто не ту,
      в которую целились), и v0.44.0's «есть настоящая находка на луче —
      остаёмся скрытым» гасил конус именно в этом случае, почти для
      каждой ягоды. **v0.46.0's фикс тоже не помог на практике** — третий
      живой репорт с тем же симптомом. Оказалось, дело было не в самом
      правиле подавления конуса (оно к тому моменту уже было отброшено), а
      в том, что угловая логика вообще ненадёжна как способ решить «то же
      самое, что для гриба» — слишком много независимых мест, где могла
      закрасться ошибка (окклюдеры, соседние экземпляры колонии, порог
      угла), и вживую они продолжали конфликтовать непредсказуемым
      образом. **Готово по-настоящему (v0.47.0)**: убрал весь отдельный
      прицельный код для мелких объектов. `collectible/worldMesh.ts`'s
      `withPickHitbox()` даёт ягоде/траве/ореху/находке невидимую сферу
      радиусом 12см поверх настоящей модели — тем же механизмом, что уже
      просто работает у гриба (крупная шляпка сама по себе ловится точным
      лучом). `game/pick.ts`'s `nearestInView` вернулся к одной простой
      проверке без всякого запасного прохода: одна и та же логика для всех
      `kind`. Проверено не только юнит-тестами, но и вживую скриптованным
      повтором на реалистичной дистанции (2м) и обычном угле взгляда
      (не искусственно круто вниз) — метка появляется, E работает, сбор
      подтверждён. **Пользователь сообщил, что на его стороне баг сохранился
      и после v0.47.0** — попутно найдено и исправлено: комментарий в коде
      ошибочно утверждал, что raycaster в three.js пропускает объекты с
      `visible=false` (проверено по исходнику `node_modules/three@0.169.0`
      — это неправда, `visible` там вообще не проверяется), хотя сама логика
      это не использовала и не пострадала. Добавлен `?debug=1` — HUD-панель
      (`main.ts`'s `updateDebugOverlay()`) с прицелом, позицией игрока,
      углом взгляда и дистанцией/углом до ближайшей мелкой находки — на
      случай, если проблема воспроизводится только у пользователя (кэш
      старой версии в браузере? другая раскладка экрана?), чтобы это можно
      было увидеть без пересылки скриншотов вслепую. **Настоящий корень
      нашёлся только через `?debug=1` на реальной сессии пользователя
      (v0.49.0)**: панель показала, что ближайшая ягода была то за пределами
      конуса зрения, то технически «в кадре», но в 1.46м В СТОРОНУ от
      самого луча прицела — потому что модель ягоды была честных 1-2см в
      поперечнике, и на любой разумной дистанции это несколько пикселей на
      экране, попасть в которые прицелом точнее «плюс-минус метр» на глаз
      просто нельзя. Три предыдущих фикса чинили ЛОГИКУ прицеливания
      (которая и правда была верна с v0.47.0) — а нужно было увеличить сам
      ОБЪЕКТ. См. «Ягоды визуально не похожи на настоящие» выше — реальный
      куст (v0.49.0) и самоподбирающийся по размеру модели хитбокс решили
      разом обе жалобы одним изменением, ровно как предположил пользователь.
- [x] **Деревья растут на дорогах и тропинках.** Готово (v0.46.0), живой
      баг-репорт. `placeOsmTrees` (`world/osmTrees.ts`) сажал
      процедурные деревья по решётке внутри полигона леса, вообще не
      зная о `world.paths` — новая `distanceToPolyline`
      (`util/geometry.ts`, открытая ломаная, в отличие от `distanceToRing`
      не замыкает последнюю точку на первую) отсеивает кандидата ближе
      `PATH_CLEARANCE` (1.8м) от осевой линии тропы. Размеченное в OSM
      дерево (`world.trees`) никогда не двигается — настоящий обмер
      важнее нашей догадки о том, где именно пролегает тропа.
- [x] **Нет подсказок по клавишам во время ходьбы.** Готово: постоянная
      приглушённая подсказка "H — управление" в HUD + панель по `H` с тем же
      текстом, что в disclaimer. Экранные кнопки для мобильных — не входили
      в этот кусок, остались с остальным тач-управлением (см. «Мобильные
      устройства» ниже); если экранные кнопки на ПК тоже когда-нибудь
      понадобятся, разумно сделать это одним заходом с ними, не отдельным UI.
- [x] **Земля без подстилки.** Готово (v0.45.0): `world/ground.ts`'s
      `litterColor()` красит обычный лесной пол (там, где нет отдельного
      цвета биома — дюна/болото) шумом `fbm2` вместо одной плоской заливки —
      тёмные пятна подстилки/бурой земли на светлее-зелёном фоне, масштаб
      патча ~3м. Не текстура — весь проект рисует без картинок (см.
      CLAUDE.md), только вершинный цвет по тому же `fbm2`, что уже красит
      рельеф и патчи кустарника. Проверено численно (диапазон канала R по
      сетке действительно меняется ~на треть между соседними ячейками) —
      на глаз в скриншоте эффект тоньше, чем ожидалось (полог/туман/сжатие
      скриншота смазывают контраст), тот же компромисс, что уже был у птиц
      (v0.39.0): данные корректны, смотреть в реальной игре с более
      близкого расстояния показательнее одного скриншота.
- [x] **Деревья не отбрасывают тени.** Формы крон разведены (три силуэта на
      лиственных, v0.5.0); `HemisphereLight` + `DirectionalLight` в
      `game/scene.ts` теней не давали вовсе, лес выглядел плоско освещённым.
      Re-checked this session: partly done, deliberately not the full "all
      1500 trees" version — `world/trees.ts`'s `buildTreeMeshes` gained an
      optional `shadowRadius`; trees within it get their own `castShadow`
      InstancedMesh batch (split by genus/variant, same draw-call shape as
      before, just doubled where the split actually produces two non-empty
      halves), everything further out stays exactly as it was. `scene.ts`
      wires the sun's own `castShadow`/shadow-camera bounds and passes
      `TREE_SHADOW_RADIUS = 45` (between the fog's near/far fade, where a
      shadow is actually visible) for the home plot's own call — the
      streamed chunks' own `buildTreeMeshes` call (`game/worldStream.ts`)
      passes no radius, unaffected. Honest limit: "all 1500 trees honestly
      shadowed" is still the real, unmeasured perf question a real
      (non-desktop) GPU would answer, not this session's headless
      SwiftShader — GPU shadow-map rasterization cost doesn't port across
      GPU classes the way CPU-bound JS timing does (unlike the chunk-build-
      cost profiling elsewhere in this file), so that stays open. What
      shipped is bounded by construction (a small, fixed radius, not the
      whole wood) rather than measured directly. Verified: 3 new unit
      tests (`world/trees.ts`'s split, no lost/duplicated tree) and a live
      headless screenshot — real, correctly-angled ground shadows under
      nearby trunks, no visible acne or peter-panning, zero console errors.
- [x] **Хвойные — один конус на весь силуэт.** Готово: `CONIFER_SHAPES`
      (`world/trees.ts`) — ель/пихта единый узкий опущенный шпиль,
      сосна/лиственница ярусная "свадебный торт" крона, поднятая выше.
- [x] **Землянка — игрушечная, дрова торчат из стены.** Готово. Живой репорт
      2026-09-09 со скриншотом и `?debug=1`-панелью: дом маленький и
      игрушечный, вид из глаз выше двери, колодец на колодец не похож, дрова
      у дома выглядят неестественно — будто торчат из стены. Все четыре —
      реальные баги, не восприятие:
      1. **Масштаб дома.** `wallHeight` был 1.7м — едва выше
         `game/player.ts`'s `STAND_EYE` (1.65м), без запаса на голову вообще;
         дверь была 0.7×1.25м (детский рост). Игрок буквально смотрел глазами
         поверх двери. `wallHeight` → 2.3м, дверь → 0.95×2.0м (`width`/`depth`
         тоже подросли, 2.6×2.2 → 3.0×2.6, иначе высокая, но такая же узкая
         коробка выглядела бы силосной башней). `SHELTER_RADIUS` (коллизия)
         пришлось поднять следом, 1.8 → 2.1 — иначе полудиагональ новой
         большей коробки (~1.99м) вылезала за старый радиус, и игрок мог бы
         протыкать угол стены.
      2. **Дрова сквозь стену — настоящая геометрическая ошибка, не только
         на глаз.** Каждое полено укладывалось повёрнутым на бок (длина
         вдоль X), а РЯД поленьев тоже был расставлен вдоль ТОЙ ЖЕ оси X —
         так что собственная длина полена (0.5м) перекрывала соседей почти
         целиком (шаг между центрами — только ~0.2м), и куча как целое
         дотягивалась своей геометрией обратно за грань стены, хотя точка
         привязки кучи (`firewood.position`) сама была снаружи стены — старый
         тест это и проверял, но не видел, что каждое полено торчит из своей
         же точки привязки дальше, чем сам тест смотрел. Ряд теперь
         расставлен вдоль Z (вдоль стены, к которой прислонена поленница),
         длина каждого полена — по-прежнему вдоль X (торцы видны снаружи, как
         и задумано), но теперь ни одно не тянется обратно к стене сильнее
         остальных. Закреплено новым тестом:
         `Box3.intersectsBox` полена и стены — `false` для каждого полена, а
         не только проверка точки привязки.
      3. **Колодец не похож на колодец.** `wellWallHeight` (высота каменного
         кольца) была 0.32м — по колено, ниже, чем столбы и крыша над ним, и
         вся сборка читалась как "две палки над каменной лужей", не колодец.
         Поднято до 0.55м (по пояс, как у настоящего колодца — облокотиться
         и поставить ведро на край), `postHeight` — 0.85 → 1.05м следом
         (столбы/балка/крыша/верёвка/ведро в коде уже были формулами от
         `postHeight`, отдельно трогать не пришлось).
      Все параметры — константы в `world/shelter.ts`, без новой логики;
      численно проверено юнит-тестами (16/16 зелёных, включая новый), вживую
      — скриншотом headless Chrome (дверь и стена теперь в масштабе, глаза на
      уровне дверного проёма, не выше).

- [x] **Гриб — идеальная фигура тела вращения.** Done. Brainstormed first
      (per the note this item used to carry) — see the design decided in
      chat 2026-09-10: `mushroom/irregularity.ts` holds two pure, tested
      functions kept apart from `build.ts` the same way `profile.ts`'s
      `capCrossSection` already is. `capWobble(phi, seed, age)` perturbs
      the cap's own lathe-swept radius by angle, sampling a circle in
      `fbm2` noise-space (so it is periodic — no seam where the sweep
      closes on itself) rather than by raw vertex position the way
      `buildRaggedCrown()` (`world/trees.ts`) does for a crown; tapered to
      zero at the apex and at the stipe so neither gets a stray hole, and
      grows with `age` (barely irregular young, more weathered mature).
      `stipeBendCurve(t)` leans the stipe's own rings sideways by height
      fraction — zero at the base (it still plants where it grew), eased
      rather than linear. The one real complication a straight port of
      `buildRaggedCrown()` would have missed: a bent stipe's tip drifts
      sideways, so the cap/hymenium/ring all had to start following that
      drift instead of assuming the tip sits straight above the base —
      `buildStipe`/`buildCap`/`buildHymenium`/`buildRing`/`buildWarts` all
      gained a real `{x, z}` offset instead of the old lateral-bracket-only
      scalar. Measurements that decide identification (`capR`, `stipeH`,
      gill/ring/volva sizing) are untouched — only the visual mesh ripples
      around them, per the brainstormed constraint. Verified by new unit
      tests (cap non-circular, wobble grows with age, stipe leans, cap
      follows the bent tip) and `npm run silhouette-sheet` across all 43
      species — no chimeric shapes, no broken silhouettes.
- [x] **Mouse-look needed an extra click after "Go".** Live report,
      2026-09-10: `game/controls.ts`'s Pointer Lock request only ever fires
      from a `click` on the canvas itself, but the click that actually picks
      a place lands on the place-picker's own button
      (`ui/placePicker.ts`) — a different element — so the very first
      `requestPointerLock()` never happened at all, and mouse-look stayed
      dead until the player clicked the game world a second time by hand.
      Fixed in `main.ts`: ask for pointer lock right where the picker's
      promise resolves, still within that click's transient user-activation
      window (a resolved promise's `.then` continuation runs as a
      microtask, not after a real delay — `loadForestData` right after it
      can take several real seconds over the network, long enough to burn
      through that window, so the request can't wait until after it
      finishes). Couldn't get a clean headless proof either way: Pointer
      Lock in headless Chrome rejects with `WrongDocumentError` regardless
      of which click asks for it or when (confirmed both the new early
      request and the old on-canvas one fail identically there) — a
      headless/CDP-specific limitation, the same class of "can't verify this
      one thing outside a real browser" already accepted for touch-emulation
      artifacts elsewhere in this file. Verify live on next real playtest.

- [x] **Экран загрузки — вращающийся гриб и прогресс-бар.** Готово: `showLoading`
      (`ui/placePicker.ts`) крутит мухомор (`buildCollectible`) в WebGL-канвасе
      и показывает полосу прогресса по стадии (`stageGeocode` → `stageOsm` →
      `stageTerrain` → `stageBuild`).
- [x] **Номер версии в углу экрана.** Готово в v0.17.0: `#version` в
      `ui/hud.ts`, читает `__APP_VERSION__`.
- [x] **Кнопка «выйти в меню» (`Esc` на ПК).** Готово в v0.17.0:
      `openExitConfirm()` в `main.ts`, на `Escape`.
- [x] **Корзина в 3D по хоткею.** Готово: `showTally` (`main.ts`, `Q`) теперь
      строит сетку карточек с превью каждого собранного экземпляра
      (`ui/preview.ts`'s `renderCollectiblePreview`, вынесен из
      `ui/encyclopedia.ts` для переиспользования) — свой seed и возраст на
      каждый предмет, не сгруппированные счётчики. Кнопка для мобильной
      версии — отдельно, вместе с остальным тач-управлением.
- [x] **След на месте сбора.** Готово: `leaveTrace()` (`main.ts`) оставляет
      тёмный диск потревоженной подстилки на месте сбора, для любого `kind`.
- [ ] **ETL и фотографии** — план 3. Таксономия из GBIF, названия из Wikidata,
      фото из iNaturalist Open Data с лицензией и автором. Поле `media` в схеме
      уже есть и валидируется, данные лягут в готовое место. Фото/лицензии/ETL-
      пайплайн как таковой не сделаны — это отдельный большой заход.
      **`gbifKey` — сделано отдельно, до остального ETL.** Сверены все 40
      видов (кроме трёх находок без биологического вида — `bird-nest`,
      `interesting-stone`, `shed-antler`, у них `gbifKey` не заполняется по
      дизайну) против настоящего GBIF Backbone через публичный
      `species/match`-эндпоинт (`https://api.gbif.org/v1/species/match?name=...`,
      без ключа). **Все 40 оказались подтверждены неверными** — ни один
      правдоподобный на вид номер, расставленный при курации, не совпал с
      настоящим `usageKey`; каждый матч пришёл `EXACT`/`ACCEPTED` с высокой
      уверенностью, включая оба смертельно опасных вида (`amanita-phalloides`,
      `galerina-marginata`) — там, где ошибка в данных стоит не бага, а
      здоровья (см. CLAUDE.md, «Responsibility»), лишняя перепроверка не
      была лишней. Значения заменены на настоящие в `data/species/*.yaml`.

## 🌤 Атмосфера и жизнь леса

Почти всё это уже написано и обкатано в
[`race-the-city`](https://github.com/kryadov/race-the-city) — брать оттуда, а не
изобретать. Пути ниже указаны относительно того репозитория.

- [x] **Птицы.** Готово: `world/birds.ts`, портирован из race-the-city.
      Взлёт/полёт/посадка на `treePerches()`, наземная возня, расстояния
      пересчитаны с масштаба города на масштаб леса.
- [ ] **Погода как выбор игрока, а не следствие `daysSinceRain`.** Дождь,
      снег и туман уже есть (`world/weather.ts`, v0.19.0, настройки — `M`),
      но это фиксированный выбор в меню, а не то, что реально идёт в лесу:
      `ecology/spawn.ts`'s `daysSinceRain` по-прежнему константа (`2`),
      влияющая на спавн грибов, никак не связанная с тем, что игрок видит
      на экране. Когда дойдём до календаря (см. «Игра»), стоит завязать
      видимую погоду на то же значение, что двигает спавн, а не держать их
      двумя независимыми ручками.
- [x] **Moon phases.** Done — didn't wait for the in-game calendar
      (`world/moonPhase.ts`'s `moonPhase(date)` reads the real synodic-month
      phase for whatever real date the player is actually playing on, a
      standard days-since-a-known-new-moon calculation; no calendar of its
      own needed, and nothing to invalidate once one exists). `world/sky.ts`
      now finds each fragment's local position on the moon's own disc
      (right/up basis perpendicular to the moon direction) and lights a
      fake hemisphere from a direction that itself rotates with the phase —
      the same terminator geometry a real moon phase actually has, not a
      dimmer full disc. Verified: unit tests for `moonPhase()` (known new
      moon, half a month later ≈ full, wraps correctly) and, since the true
      disc is tiny and the demo wood's trees made it hard to frame directly,
      a live headless check with the disc's own lit-mask threshold
      temporarily widened ~30× confirmed the underlying local-coordinate
      math is a smooth, continuous, non-degenerate gradient across the
      whole moon-relative angular space — the algebraic derivation (phase
      0/0.25/0.5/0.75 → new/quarter/full/quarter, checked by hand) is what
      the actual tight disc relies on.
- [x] **Ручей, водопад, источники рядом с водоёмами.** Готово (v0.40.0):
      `world/water.ts` теперь различает пруд и ручей по форме кольца
      (`classifyWater` — замкнутое и компактное значит пруд, вытянутое или
      разомкнутое значит ручей, без отдельного тега через `WorldData`).
      Ручей рисуется рябящейся лентой, идущей по уклону дна (`update(t)`,
      как у остальной анимации в игре — дым очага, погода), а не одной
      плоской панелью. Там, где вдоль ручья находится резкий перепад высоты
      (`findWaterfall`), встаёт полупрозрачный водопад с дышащей
      непрозрачностью вместо честных брызг. `placeSprings`/
      `buildSpringMeshes` добавляют несколько родников рядом с водоёмами —
      не по трассе OSM, а смещённые в сторону, как в жизни. Проверено
      скриншотом (временный ручей у домика, лента видна и течёт).
- [x] **Живность помимо птиц (1/3): архитектура + заяц + белка.**
      Брейншторм и архитектура решены разом для всех пяти видов —
      `docs/superpowers/specs/2026-09-10-wildlife-design.md`: два яруса,
      не пять ad hoc систем — наземная живность (`world/critters.ts`,
      общая state machine `idle → alert → flee → resting`, разделяемая
      зайцем/белкой/змеёй) и рой насекомых (`world/insects.ts`, ещё не
      реализован — п. 3/3). `stepCritter` — чистая, тестируемая функция
      одного тика; `createCritterGroup` крутит на ней N инстансов через
      InstancedMesh, как `birds.ts`. Белка ищет ближайший `TreePerch`
      (уже был в `trees.ts` для птиц) как цель побега, заяц просто
      убегает от игрока по прямой. `placeCritterHomes` — россыпь точек
      отдыха через `findOpenSpot`, тот же вопрос "где есть место", что у
      шалаша/костра, просто заданный N раз. Проверено скриншотом
      (заяц и белка у домика).
- [x] **Живность (2/3): змея.** `createSnakes` — та же state machine из
      `world/critters.ts`, свой `SNAKE_SPECIES` вместо новой ветки кода:
      маленький `fleeRadius` и низкая `fleeSpeed` дают "медленно уползает"
      вместо испуга вскачь зайца/белки. Поза — единственное по-настоящему
      новое: цепочка из пяти сужающихся сегментов, каждый со своим
      смещением назад вдоль heading и стоячей синусоидой сбоку, бегущей от
      времени, а не от пройденного пути — дешёвая имитация извивания без
      хранения истории пути. Редкая (двое на лес). Проверено скриншотом.
- [x] **Живность (3/3): улей + пчёлы + стрекозы.** `world/insects.ts` —
      `createSwarm`, рой без состояний (кружит вокруг опорной точки по
      фиксированной орбите с покачиванием, не реагирует на игрока — чистая
      функция времени, как перья/дым), сознательно отдельно от
      `world/critters.ts`: круговой рой и "испугался-убежал" не делят
      достаточно логики, чтобы стоило одной общей машины состояний.
      `world/hive.ts` — `placeHive` сажает дикий улей прямо на ствол
      случайного дерева (решено в брейншторме: не отдельно стоящий ящик и
      не пасека), возвращает `null`, если в лесу вообще нет деревьев.
      Стрекозы садятся по `classifyWater(ring) === 'pond'` — только когда в
      локации есть пруд (не бегущий ручей), тот же паттерн честного `null`,
      что у домика рыбака (`fisherHut.ts`). Проверено скриншотом (улей и
      пчела на стволе); рой стрекоз подтверждён интеграционными тестами
      (`createSwarm`/`createDragonflies` держат каждую особь в пределах
      своей орбиты вокруг якоря) — сама сцена с прудом кадрировалась хуже
      из-за плотного леса вокруг воды, решено считать тестовое покрытие
      достаточным. Все три части живности из этого пункта TODO закрыты.
- [x] **Wildlife reads as a couple of oddly-coloured shapes, not animals
      (hare/squirrel).** Live feedback, 2026-09-10. Root cause: no head —
      ears were glued straight onto the body, so both read as a legless
      lump rather than an animal, whatever the colour. `world/critters.ts`
      gained a real `headGeometry()` (a squashed icosahedron, forward and
      above the body centre) that the ears now attach to instead of the
      body directly, plus a small tail nub for the hare (the squirrel
      already had its own bushy one). Same fixed-tilt-through-a-quaternion
      trick `world/birds.ts` already uses for a grounded bird's neck/tail
      leans the ears back off the head. Verified by the existing test
      suite (unaffected — index 0 is still the body mesh) and a live
      headless screenshot of each: both now show a clearly separate
      head-with-ears silhouette instead of a blob. Colour itself
      (sandy-brown hare, rust-red squirrel) was left alone — the shape was
      the actual problem. Not revisited: the snake (already reads as a
      segmented chain, see its own screenshot from v0.64.0) and the bees/
      dragonflies (ambient background detail, not scrutinised up close the
      way a hare/squirrel is).
- [x] **Railway and a train.** A low-priority addition — a rail line and a
      passing train through the wood, ported from `race-the-city`'s own
      idea (station platforms, level crossings, three train classes for a
      real city network — none of it applies to a wood, per CLAUDE.md's
      own donor-code lesson). `world/railway.ts` (new): `placeRailLine` is
      a single straight narrow-gauge line offset from the middle (never
      through the hut's own clearing), ground-following at each of a
      handful of sampled points; `createTrain` shuttles a short 3-car train
      back and forth along it (a dead-end spur, not a loop — no points, no
      sidings, honest scope cuts from a real network). Runs in every wood,
      demo or real-place, unconditionally — unlike the mine, this needs no
      real survey data to mean something. Verified: 15 unit tests (line
      placement, ground-height interpolation, the bounce-at-either-end
      step function, car positions staying finite and in-bounds over a
      long run) and two live headless screenshots — sleepers receding in
      correct perspective with a train car visible down the line, and a
      closer pass confirming the car's own colour/geometry, zero console
      errors both times (temporary scene-exposure and teleport debug hooks
      used to find and frame it, both reverted, `git diff` empty before
      commit).

## 🚶 Ходьба и ориентирование

- [x] **Покачивание камеры и ритм шага.** Готово: `PlayerState.bobPhase` +
      `cameraBob()` (`game/player.ts`) — вертикальный подъём и боковой качок
      от пройденной дистанции, не от времени. Момент для звуков шагов —
      этот же `bobPhase`, теперь используется (`audio/footsteps.ts`, see 🔊
      above).
- [x] **Мини-карта.** Готово: `ui/minimap.ts`, портирован из race-the-city.
      Компас по умолчанию, мини-карта — пункт в настройках (`Prefs.minimap`,
      выключена по умолчанию), без единой отметки гриба; единственный
      ориентир на ней — землянка.
- [x] **Запрыгнуть на валун, пень или тонкое бревно, если высота позволяет.**
      Готово: `Obstacle.topHeight` + `PlayerState.stand` в `game/player.ts` —
      препятствие ниже `MAX_STEP_HEIGHT` (0.55 м) больше не выталкивает, а
      поднимает камеру на свою высоту.
- [x] **Настройка мыши — инвертировать обзор по вертикали.** Готово.
      `Prefs.invertMouseY` (по умолчанию `false`) — `game/controls.ts`'s
      `move()` и `game/touchControls.ts`'s свайп-обзор оба домножают `dPitch`
      на `invertY ? -1 : 1`, каждый через свой `setInvertY(v)` (тот же
      паттерн, что уже был у `setSensitivity`). Пункт в меню настроек —
      новый вкл/выкл-тумблер `ui/settingsMenu.ts`'s `toggle(key, labelKey)`,
      вынесенный из уже существующего тумблера мини-карты (была ровно та же
      разметка/обработчики, скопированная под новый булев ключ — второй
      реальный случай использования, не заранее придуманная абстракция).

## 🔊 Звук

Тон игры держится на тишине, и тишина должна быть живой. Из race-the-city
переносится только обвязка — микшер, громкости, пункт в меню (`src/audio/audio.ts`,
498 строк); содержимое там своё, мотор и радио, нам оно не подходит.

- [ ] **Фон леса** — ветер в кронах, скрип стволов, шорох листвы. Меняется от
      погоды и времени суток, а не крутится одной петлёй. Пока не сделано —
      не путать с музыкальной подложкой дня/ночи/костра ниже (это фоновые
      ЗВУКИ ЛЕСА, отдельная задача).
- [x] **Музыка: день/ночь/костёр.** Живой запрос 2026-09-11 — впервые в этом
      файле настоящая запись вместо синтеза (см. `audio/audio.ts`'s
      обновлённый докстринг для честного объяснения исключения). Три
      реальных mp3 (zvukbox.ru, метаданные и обложка вырезаны ffmpeg перед
      тем, как они попали в репозиторий) лежат в `public/audio/`:
      `day.mp3`/`night.mp3` кроссфейдят по `world/daynight.ts`'s новому
      `nightFactor(t)` (та же величина, что уже красит небо и гасит окна
      шалаша — не отдельная логика "ночи"), `campfire.mp3` заменяет их
      собой по мере приближения к костру (`audio/musicAmbience.ts`'s
      `campfireGain`, та же линейная затухающая форма, что у воды/птиц).
      Своя настройка громкости в меню (`Prefs.musicVolume`), независимая от
      `soundVolume`. Заодно — второй живой запрос того же дня: **шаги
      ходьбы/бега настоящей записью.** `walk.mp3` (2с)/`run.mp3` (3с), та же
      очистка ffmpeg, заменяют синтезированный `footstep()` для сухой земли
      целиком (вода — по-прежнему синтезированный всплеск, запись под него
      не подразумевалась); своя громкость `Prefs.footstepVolume`. Спринт —
      новая механика (`Shift`), которой в игре раньше не было вовсе:
      обнаружился конфликт клавиш (`Shift` уже был приседанием) — решено
      переносом приседания на один `Ctrl`, освобождая `Shift` под спринт,
      стандартная FPS-раскладка. `game/player.ts`'s `stepPlayer` получил
      `SPRINT_SPEED`, отказывает в спринте на корточках (та же логика, что
      уже отказывает в прыжке на корточках). Проверено: юнит-тесты
      (`nightFactor`, `campfireGain`, спринт-скорость и отказ на корточках),
      `npm test`/`npm run build`/`npm run boot-check` зелёные, и живой
      headless-прогон демо-леса с удержанием `W`+`Shift` — все 5 mp3
      подтянуты (200), ни одной ошибки консоли. **Живой репорт сразу после
      релиза (v0.80.0): «звук шагов не синхронизирован с ходьбой».**
      Настоящая причина — архитектурная, не мелочь: `walk.mp3`/`run.mp3`
      были сведены как непрерывная фоновая петля (`AudioEngine.
      updateFootstepLoop`, тот же паттерн, что уже работал у воды/музыки) —
      источник стартовал один раз при загрузке и крутился на своём
      собственном темпе весь сеанс, громкость только включалась/
      выключалась. У воды и музыки это верно (там нет "удара", на который
      нужно попадать), а у шагов — неверно: звук никогда не стартовал
      именно с касания стопой земли, и с каждым шагом расхождение только
      росло. Исправлено (v0.80.1): `footstepClip(sprinting)` — вместо
      петли, одноразовый запуск записи с offset 0 на каждый `crossedFootstep()`,
      ровно то же событие, что уже двигает синтезированный `footstep()`
      для воды — Web Audio источники одноразовые, поэтому это всегда новый
      `AudioBufferSourceNode`, обрезанный до короткого куска (0.4с ходьба,
      0.3с бег — короче для более частого бегового шага) с плавным
      затуханием на хвосте. Проверено: `npm test`/`build`/`boot-check`
      зелёные, живой headless-прогон без ошибок консоли.
- [x] **Шаги** — разные по субстрату: подстилка, мох, песок, вода. Done:
      `audio/footsteps.ts`'s `crossedFootstep` fires once per foot touch-down
      off the camera-bob phase (`game/player.ts`'s `bobPhase`, two crossings
      per `2·PI`), `footstepSubstrate` picks the sound from the biome under
      the player plus a water-ring proximity check (mirrors `ecology/
      sites.ts`'s own moisture check); `AudioEngine.footstep()` synthesises
      one of four short filtered-noise bursts per substrate (water adds a
      descending-sine "plop"), same short-discrete-event synthesis choice as
      `collect()` above. Verification gap, honestly noted: headless Chrome
      throttles `requestAnimationFrame` to ~1-2Hz for a backgrounded tab, so
      a wall-clock key-hold in the live-check script only ever simulated
      ~0.4 game-seconds — short of one stride length — and never proved a
      footstep actually fired live (same class of gap as the Pointer Lock
      note elsewhere in this file). Covered instead by unit tests of the
      pure trigger/substrate logic (9 tests) and a clean, error-free live
      walk with no exceptions thrown from the audio wiring.
- [x] **Вода** — речка и озеро слышны раньше, чем видны, и громче вблизи. Это
      даёт настоящий ориентир в лесу, где ориентиров мало. Done (same task
      as the "Звук воды" live-report item above): `audio/waterAmbience.ts`
      holds the pure, tested distance→gain half (`nearestWater`, mirroring
      `nearestBird`, and `waterAmbienceGain`, the same linear falloff shape
      as `birdGain`) against `world/water.ts`'s own pond/stream rings, kinds
      classified once at load (`classifyWater`) rather than every frame.
      `AudioEngine.updateWaterAmbience()` is the one continuous, looping
      node graph in `audio/audio.ts` (everything else there is fire-and-
      forget) — a looping noise buffer through a lowpass filter swept by one
      LFO (the moving-water texture) into an amplitude-wobble gain driven by
      a second LFO (the bubbling pulse), built lazily once and only ever
      ramped afterwards (`setTargetAtTime`, no click). Stream vs pond get
      different characters (`WATER_AMBIENCE_PARAMS`): the stream's LFOs run
      faster and deeper and it plays louder; the pond's are slow, shallow
      and near-silent — same synthesis, no separate recording, per the
      "everything here draws without pictures" rule (see the updated header
      comment in `audio/audio.ts` — the original plan to source a real CC0
      recording for continuous ambience specifically was reconsidered here).
      Wired into `main.ts`'s per-frame loop next to the existing bird-call/
      footstep audio calls, through `Prefs.soundVolume` the same way the
      rest of the mixer already works. Verified: 9 new unit tests for the
      pure module (`nearestWater`/`waterAmbienceGain`), `npm test` (735
      green) and `npm run build` green, and a live headless-Chrome walk
      (clicked into the demo wood, held movement toward its own pond for
      real wall-clock time) with no console errors or thrown exceptions —
      the DSP node wiring itself isn't unit-tested, same accepted gap as the
      rest of `audio/audio.ts`.
- [x] **Птицы** — привязать к стае из `birds.ts`, чтобы голос шёл из точки, где
      птица сидит, а не из ниоткуда. Done: re-triaged this session — this
      was grouped with the continuous-ambient items above (wind, water),
      but a single call is a short discrete event like `collect()`/
      `footstep()`, not a texture, so it doesn't need a real recording.
      `world/birds.ts`'s `Bird` now tracks its own last-rendered `x/y/z`
      (cached at the exact point `update()` already computes it for
      rendering, no new math) and exposes them via a new `positions()`;
      `audio/birdCalls.ts`'s pure `birdPan`/`birdGain`/`nearestBird` decide
      which bird calls and how it should sound from where the player
      stands; `AudioEngine.birdCall()` synthesizes a two-note chirp through
      a `StereoPannerNode`. `main.ts` rolls a random 4-11s wait between
      calls (`world/birds.ts`'s own perch-timer shape, just for audio).
      Verified: 12 new unit tests for the pure pan/gain/picker logic, plus
      a live headless run with zero console errors.
- [x] **Сбор гриба** — короткий сухой звук среза. Готово, но осознанным
      отступлением от "источника записей" ниже: не CC0-запись, а
      синтезированный звук (короткий шумовой всплеск через `highpass`-фильтр
      с резкой атакой и быстрым экспоненциальным спадом — `src/audio/
      audio.ts`'s `collect()`). Причина — тот же принцип, что уже держит
      весь остальной проект: "весь проект рисует без картинок" (CLAUDE.md,
      Conventions) — грибы, рельеф, подстилка сгенерированы из чисел, а не
      взяты готовыми ассетами; один короткий "щелчок" — тот же приём,
      применённый к звуку. Для более крупного плана ниже (фон леса, шаги,
      вода, птицы) синтез не подходит — тем нужно звучать как настоящие
      записанные места, вот там и остаётся сборка настоящих CC0-записей.
      Обвязка перенесена из race-the-city, как и планировалось (`src/audio/
      audio.ts`, свой, не 498 строк оригинала — там мотор/радио, которых
      здесь нет и не будет): один `AudioContext`, один `sfxGain`,
      `resume()` по первому гарантированному пользовательскому жесту
      (клик по месту на экране выбора места — есть у каждого игрока, новый
      он или нет). Громкость — `Prefs.soundVolume` (0..1, без отдельного
      вкл/выкл — для одного эффекта это лишний контрол), ползунок в меню
      настроек. **Попутно найден и исправлен реальный баг**: `save/
      store.ts`'s `loadSave()` мёржил сейв с дефолтами только на верхнем
      уровне (`{...emptySave(), ...stored}`) — `prefs` вложенный объект, и
      старый сейв (сохранённый до появления `soundVolume`) целиком
      перекрывал бы весь `defaultPrefs()`, обнуляя заодно и остальные
      prefs-поля, которых в старом сейве тоже не было бы, не только новое.
      Новый `mergeSave()` мёржит `prefs` отдельным уровнем, покрыт тестом.
- [ ] Источник записей для остального звука: CC0-библиотеки (freesound под
      CC0, BBC Sound Effects). Лицензию каждого файла хранить рядом, как у
      фотографий видов. Не относится к звуку сбора гриба (см. выше — он
      синтезирован, не записан).

## 🌲 Наполнение леса

Кусты, валежник и камни — **не декорация, а субстрат**. Валеж (`deadwood`) и
валуны (`moss`) уже стоят в мире и дают реальную опору грибам этих субстратов
(v0.5.0); `litter`, `livewood`, `burnt` пока представлены только случайной
почвой без своей геометрии.

- [x] **Лесные находки за пределами грибов — ягоды, травы, орехи, небиологические
      находки.** Готово в v0.22.0…v0.26.0. Спека:
      `docs/superpowers/specs/2026-09-08-forest-finds-design.md`. `Species` —
      дискриминированное объединение по `kind: 'mushroom'|'berry'|'herb'|'nut'|
      'find'`, общий `species/schema.ts`, общая энциклопедия с фильтром по
      типу. Виды: черника, брусника, морошка, земляника (ягоды); крапива,
      черемша, щавель (травы); лещина, жёлудь (орехи — «шишку» сознательно не
      стали делать отдельным видом, см. спеку); птичье гнездо, сброшенный
      рог, интересный камень (находки, без `edibility`/`gbifKey`).
      `ecology/sites.ts`, `ecology/spawn.ts`, `save/store.ts` не потребовали
      изменений — предсказано спекой и подтверждено на практике.
- [x] **Ягоды визуально не похожи на настоящие — и это оказалось той же
      причиной, по которой их было физически невозможно собрать.** Готово
      (v0.49.0). По просьбе пользователя 2026-09-09 ягода теперь растёт на
      настоящем кусте — несколько веток (`orientAlong()`, ориентирует
      цилиндр от основания к своей же вершине) несут листья и сами ягоды на
      концах, вместо кластера сфер диаметром 1-2см, висящего в воздухе.
      Новое поле `bushHeight` (`species/schema.ts`'s `BerryMorphology`, мм)
      — от стелющейся брусники (100-180мм) и одностебельной морошки
      (120-220мм) до черники в колено (250-400мм) — задаёт высоту куста,
      той же логикой "один фактор `size` двигает всё", что и у гриба/травы.
      **Что на самом деле выяснилось в процессе живой отладки** (см. ниже,
      «Живой репорт про ягоды») — три предыдущих фикса прицела (v0.44…
      v0.47) были технически верны, а ягоды всё равно не собирались,
      потому что модель ягоды была настоящих 1-2см в поперечнике — на любой
      разумной дистанции это несколько пикселей, физически невозможно
      прицелиться точнее «плюс-минус метр» на глаз. `withPickHitbox`
      (`collectible/worldMesh.ts`) теперь сама подбирает размер и центр
      невидимой сферы под реальный `Box3` модели, а не использует одну
      фиксированную сферу у земли — попадание в куст возможно там, где
      куст реально есть, не только у его основания.
- [x] **Полу-поваленные деревья.** Готово: `LeaningTree`
      (`world/deadwood.ts`) — комель на месте, наклон и высота определяют,
      где повисла крона. Реже логов и пней; всегда стена (без topHeight).
- [x] **Кустарник растёт равномерно, а не пятнами.** Готово: `placeBushes`
      (`world/undergrowth.ts`) фильтрует кандидатов шумовым полем (тот же
      принцип, что и у пород деревьев/полян) — читается участками.
- [x] **Землянка выглядит слишком просто.** Готово: `buildShelterMesh()`
      (`world/shelter.ts`) возвращает окна/дверь/трубу+дым/свет ночью
      (`setNight`, завязан на `updateDayNight`) + рифлёные "венцы" на стенах.
- [x] **Землянка — доработка по живому фидбеку 2026-09-09.** Готово
      (v0.48.0), три правки: (1) у каждого окна теперь настоящий крестовый
      переплёт (`muntinMat`/`vMuntinGeo`/`hMuntinGeo` в `buildWindow()`) —
      боксы, не плоскости, поэтому видны с любой стороны без прежней
      баги «стекло невидимо с одной стороны»; (2) свет из-под дома —
      `hearthLight` (`PointLight`) светил сквозь стены/пол насквозь, потому
      что тени нигде в игре не включены (`renderer.shadowMap` был `false`
      всюду) — включил тени ТОЧЕЧНО для одного света и одного объекта
      (`walls.castShadow/receiveShadow`, `hearthLight.castShadow`,
      `ground.ts`'s `mesh.receiveShadow`), не трогая остальной мир (полторы
      тысячи деревьев с честными тенями — отдельная задача по
      производительности, см. ниже); (3) охапка дров (штабель цилиндров
      с более светлыми торцами) и колодец (открытый цилиндр-сруб, два
      столба, перекладина, крыша, верёвка, ведро) — оба просто новые
      подгруппы в `buildShelterMesh()`, без своей коллизии (декорация, как
      дверные бороздки/дым).
- [x] Домик-землянку брать из OSM, когда есть настоящая. Готово: `geo/parse.ts`'s
      `isShelterTag` разбирает `tourism=wilderness_hut`, `amenity=shelter`,
      `building=hut`, `man_made=tower` — узел напрямую, полигон (постройка) через
      `util/geometry.ts`'s новый `centroidOf`, единственное осмысленное
      "положение" контура без честного взвешенного центроида (обмер хижины
      маленький и почти выпуклый, разница не стоит лишней математики). Тот же
      принцип, что уже у `world/osmTrees.ts` для деревьев — размеченная находка
      всегда выигрывает у процедурной догадки: `placeShelter` (`world/shelter.ts`)
      получил пятый параметр `mapped: Vec2[]`, и первая же точка внутри участка
      ставит домик именно там, без всякого `findOpenSpot`-поиска; ориентация
      всё равно по seed — OSM почти никогда не пишет, куда смотрит дверь.
      `forestQuery` (`geo/overpass.ts`) — единственное сознательное исключение из
      "здания не наш бизнес" (см. doc-комментарий `WorldData` в `geo/types.ts`),
      сужено до одного значения тега `building=hut`, обычный дом не подхватится.
- [x] **Костёр с котелком и скамейкой — отдельно от землянки.** Готово, по
      прямой просьбе пользователя 2026-09-09. Новый `world/campfire.ts` —
      второй такой же "неподвижный ориентир", как землянка, но специально
      сидит НЕ рядом с ней, а на настоящей поляне (`world/clearings.ts`'s
      `isClearing`) где-то в другой части участка: `placeCampfire` ищет от
      точки, смещённой в сторону, противоположную землянке через центр
      участка (с шумом, чтобы не всегда строго напротив), тем же
      `findOpenSpot`, что уже искал место для землянки/старта игрока —
      `util/openSpot.ts`'s `findOpenSpot` получил новый необязательный
      параметр `extra` (доп. предикат сверх clearance), чтобы искать не
      просто "где свободно", а "где свободно И поляна", не заводя вторую
      копию алгоритма кольцевого поиска. Сложены крест-накрест
      обугленные брёвна внутри кольца мелких камней, угли — палитра
      бело-жёлто-красный (`EMBER_COLORS`) по прямой просьбе пользователя,
      каждый уголёк — свой `emissive`-материал, мерцает по двум несинхронным
      синусоидам (детерминированно, без `Math.random`, см. Conventions в
      CLAUDE.md), точечный свет с тем же мерцанием освещает поляну ночью и
      днём — угли светятся всегда, не только в темноте, в отличие от окон
      землянки. Треножник из трёх столбов (`quaternion.setFromUnitVectors`,
      тот же приём направления цилиндра между двумя точками, что уже у
      `berry/build.ts`'s `orientAlong`) держит котелок (усечённый конус)
      над огнём. Скамейка — доска на двух ножках, развёрнута к костру.
      Дым — тот же спрайтовый приём, что уже был у трубы землянки, но
      формулы (смещение/масштаб/прозрачность через lifecycle-долю `t`)
      вынесены в общий `world/smoke.ts` — не потому что дублирование само по
      себе плохо, а потому что это ВТОРОЕ реальное использование одной и той
      же формулы (землянка не тронута, работает как раньше, просто теперь
      не единственный потребитель). Проверено вживую: 542 юнит-теста зелёные
      (включая новые `openSpot`/`smoke`/`campfire`), скриншотом headless
      Chrome (временный телепорт игрока к костру для кадра, возвращён перед
      коммитом, `git diff` сверен на чистоту) — кольцо камней, крестовина
      брёвен, светящиеся угли трёх цветов, треножник с котелком, скамейка —
      всё на месте и в масштабе.
- [x] **Заходить в землянку, открывать/закрывать дверь (1/2 — сама
      возможность зайти).** Готово, по прямой просьбе пользователя
      2026-09-09. Стены (`world/shelter.ts`) были одним сплошным
      `BoxGeometry`, а коллизия — одной большой окружностью на весь дом:
      физически нельзя было ни увидеть интерьер (снаружи камеры внутри
      сплошного бокса не рисуются задние грани, изнутри было бы видно
      насквозь), ни пройти сквозь стену. Стены разобраны на 6 отдельных
      панелей (два сегмента фасада вокруг проёма, перемычка над ним, три
      глухие стены) вместо одного бокса — плюс дощатый пол. Дверь — не
      вставленная в проём заглушка, а настоящая створка на петле
      (`doorHinge`-группа, `quaternion`/`rotation.y` не нужны — обычный
      Y-поворот, ручка у свободного края, не у петли), качается по простой
      экспоненциальной анимации к целевому углу в `update(dt)`.

      **Коллизия — самая тонкая часть.** `game/player.ts`'s `Obstacle` умеет
      только окружности, не отрезки/боксы — стена представлена кольцом
      мелких окружностей (`wallObstacles`, шаг 0.3м, каждая радиусом 0.16м,
      достаточно часто, чтобы `PLAYER_RADIUS` (0.3м) не проскользнул между
      двумя соседними) с разрывом у двери. Дверной проём — отдельная
      МУТИРУЕМАЯ окружность (`doorObstacle`): `game/scene.ts` кладёт этот
      же самый объект в `extraObstacles` один раз, а `toggleDoor()` потом
      просто меняет её `.radius` (0 открыто, реальный радиус закрыто) —
      `stepPlayer` читает препятствия по ссылке каждый кадр, не копирует, так
      что мутация видна сразу, без пересборки массива. **Реальный баг,
      пойманный интеграционным тестом, не только осмотром**: первая версия
      поставила окружность у края проёма ЦЕНТРОМ ровно на видимой границе
      двери — но у окружности есть собственный радиус, съедающий часть
      прохода ещё раз поверх радиуса игрока, отчего фактический проходимый
      зазор ужимался до пары сантиметров вместо честных ~0.95м. Тест
      `stepPlayer`'а, реально идущего от двери и обратно (закрыта → заперт
      снаружи, открыта → проходит внутрь), поймал это как несостоявшийся
      «open» случай ещё до того, как дошло до живой проверки. Исправлено:
      окружности стены теперь отступают от видимого края проёма на
      собственный радиус, так что блокирует именно край окружности, а не её
      центр.

      `shelterObstacle()` (одна большая окружность) никуда не делась — она
      по-прежнему нужна костру (`placeCampfire`) и всему будущему, чтобы
      держаться подальше от ВСЕЙ землянки целиком, просто больше не участвует
      в коллизии самого игрока (иначе игрок не подошёл бы к двери даже
      снаружи).

      Взаимодействие — по образцу гриба: `E` рядом с дверью (простая
      дистанция до `doorPosition()`, не прицел — дверь размером с комнату, не
      с гриб) открывает/закрывает её вместо осмотра прицельного гриба;
      HUD-подсказка "Дверь — E" по тому же `hud.setTarget()`. На тач-вводе —
      тап, не попавший ни в один гриб, рядом с дверью делает то же самое
      (своей кнопки-жеста для этого не заводили). Проверено: 25/25 юнит-тестов
      `shelter.test.ts` зелёные (включая новый интеграционный — `stepPlayer`
      реально доходит и останавливается у закрытой двери, реально проходит
      при открытой), живым скриншотом headless Chrome под углом (прямо в лоб
      открытую и закрытую дверь не отличить на глаз — снята сбоку, видно
      развёрнутую створку) — временный телепорт игрока к двери для кадра,
      `git diff` на `main.ts` сверен на чистоту перед коммитом.
- [x] **Мебель внутри землянки (2/2)** — стол, кровать, картина на стене,
      чашка на столе. Готово, по прямой просьбе пользователя 2026-09-09.
      Кровать (рама+матрас+подушка+четыре ножки) и стол (столешница+четыре
      ножки, чашка — отдельный именованный child, но ребёнок группы стола,
      не свободный объект) прижаты каждый к своей боковой стене
      (`BED_X`/`TABLE_X` в `world/shelter.ts`, формулы от `WIDTH`/
      `WALL_THICKNESS`, не подобранные на глаз числа), оставляя центральный
      коридор от двери до задней стены свободным для ходьбы. Картина — на
      задней стене, без окна на ней в отличие от боковых, свободное место.
      **Картина — не картинка**: весь проект рисует без изображений (см.
      CLAUDE.md, Conventions), так что "холст" — россыпь плоских фигур (небо,
      полоса земли, солнце, два силуэта хвойных), а не текстура. `DoubleSide`
      на каждой — тот же защитный приём, что уже стоит у окон, специально
      чтобы не повторять их же баг "не видно с одной стороны" на объекте,
      который и так маленький и почти не будет проверен под всеми углами.
      И кровать, и стол получили свою коллизионную окружность
      (`interiorObstacles()`, добавлены в `extraObstacles` тем же путём, что
      `wallObstacles`/`doorObstacle`) — мебель твёрдая, не проходится
      насквозь, но обе окружности достаточно узкие, чтобы не перекрыть
      центральный коридор. Проверено: 30/30 юнит-тестов `shelter.test.ts`
      (включая новые — обе коллизии существуют и вращаются с домиком, чашка
      стоит на поверхности стола, а не в воздухе/внутри неё, у картины
      больше одного цвета), живым скриншотом изнутри домика (временный
      телепорт игрока за уже открытую дверь, `git diff` на `main.ts` пуст
      перед коммитом) — кровать видна, в масштабе, у своей стены; стол и
      картина не попали в удачный кадр с первой попытки, но структурные
      тесты покрывают их подробнее, чем один скриншот успел бы.
- [x] **Домик рыбака и лодка на берегу** — по прямой просьбе пользователя
      2026-09-09, если в текущей локации есть водоём. Готово: новый
      `world/fisherHut.ts`, `placeFisherHut()` возвращает `null` целиком,
      когда `source.water` пуст — не домик посреди сухого леса, а честное
      отсутствие. Пруд предпочитается ручью, когда в лесу есть оба
      (`classifyWater()` уже отличает их, см. `world/water.ts`) — домик
      рыбака стоит на берегу озера, а не вдоль бегущего ручья. Сам домик —
      сознательно ПРОЩЕ землянки: один сплошной `BoxGeometry` + крыша + дверь-
      заглушка + окно, без интерьера и без разбора стен на панели — в него
      никто не просил заходить, а честная одна-окружность-коллизия дешевле,
      чем повторять для второго здания всю ту же работу, что землянка
      получила в v0.60.0. Лодка — не примитив (бокс/конус), а
      `ExtrudeGeometry` из плоского контура (нос и корма сужаются в точку,
      миделевая часть — самая широкая) — ни бокс, ни один конус не сужаются
      с ОБОИХ концов сразу. Лежит на самом берегу (та же вершина кольца
      водоёма, от которой велся поиск места для домика), развёрнута вдоль
      касательной берега, а не носом в воду — вытащенная на берег лодка, не
      готовая к отплытию. Домик сидит поодаль, лицом к воде
      (`Math.atan2` — тот же приём "развернуть на -Z, откуда домик
      сместился", что уже у `world/campfire.ts` и `doorPosition()` в
      `world/shelter.ts`). Проверено: 10/10 юнит-тестов (включая
      геометрическую проверку — bounding box лодки шире по длине, чем по
      ширине — и что лодка садится ровно на вершину берега, а домик поодаль),
      живым скриншотом headless Chrome (виден пруд, виден силуэт крыши под
      углом сверху — точный кадр с лодкой в объектив с первой попытки не
      дался, структурные тесты покрывают её подробнее) — временный телепорт
      игрока и временное поле в `Forest` для скриншота, оба возвращены,
      `git diff` пуст перед коммитом.
- [x] Всё перечисленное — инстансами. Готово, но не в этом заходе —
      обнаружено при аудите перед другой задачей (2026-09-09): валуны
      (`world/boulders.ts`), валежник/пни/наклонные деревья
      (`world/deadwood.ts`), кустарник (`world/undergrowth.ts`), папоротник и
      цветы (`world/flora.ts`), трава (`world/grass.ts`) — все уже строят
      `THREE.InstancedMesh` + `setMatrixAt`, как и деревья
      (`world/trees.ts`). Формулировка пункта была устаревшей, не код —
      TODO не обновили, когда это было сделано.
- [x] …но БЕЗ отсечения по дальности — Done (2026-09-11 live-report batch).
      Fog (`game/scene.ts`'s `Fog(...,30,140)`) visually hides the distance,
      but that's a shader effect over geometry already drawn, not a reason to
      skip drawing it — the GPU rasterized everything inside the sky dome
      (radius 1500, `world/sky.ts`) regardless. Only mushrooms were ever
      actually culled (`main.ts`'s `cullDistantMushrooms`).
      **What changed:** new `world/instanceCulling.ts` — `THREE.InstancedMesh`
      genuinely can't cheaply drop one instance from its own draw call (the
      buffer would need rebuilding), so instead a far instance's own matrix
      gets scaled to zero (degenerate, draws nothing, same buffer, same draw
      call) and restored to its exact original transform once back in range.
      `collectScatterCullers(root)` snapshots every static-scatter
      `THREE.InstancedMesh` (trees/boulders/deadwood/leaning-trees/
      undergrowth/flora/grass — named groups, deliberately excluding birds/
      critters/insects, which re-pose their own instances every frame and
      would fight this) the moment a wood (or a streamed chunk) finishes
      building; `sweep(camX, camZ, radius)` recomputes fresh from the current
      position every call, so it is safe to call it rarely — no accumulated
      state to go stale. `game/scene.ts` exposes `Forest.updateScatterCulling`
      for the home plot, `game/worldStream.ts` gives every loaded chunk its
      own culler and a matching `WorldStream.updateScatterCulling`.
      `main.ts` calls both from the render loop, but only every
      `SCATTER_CULL_INTERVAL_FRAMES` (20) frames rather than every one — the
      sweep itself is a full pass over every tracked instance (a few thousand
      in a typical wood), cheap once but wasteful 60 times a second for
      something that only changes as fast as the player walks. Radius is a
      fixed `SCATTER_CULL_RADIUS = 155` (past the fog's own far distance,
      140, plus a margin) rather than tied to `drawDistance` (which only ever
      governed the much shorter 20-80m mushroom cull) — nothing culled here
      was visible anyway, so there is no pop to tune around, only GPU work to
      remove. Verified deterministically: `test/world/instanceCulling.test.ts`
      (zeroing, exact restoration, needsUpdate/version only bumped when
      something actually changed, order-independence, group-name filtering)
      and `test/game/worldStream.test.ts`'s own `updateScatterCulling` test
      against a real streamed chunk. **Honest limit, unchanged from the
      original note:** the real frame-time win (fewer triangles the GPU
      actually has to shade) is a GPU-bound number this session's headless
      SwiftShader cannot measure meaningfully — only that the culling logic
      itself is correct and cheap (a plain array scan) is verified here.

## 📱 Мобильные устройства

Отдельным этапом, после реальной географии. Сейчас игра неиграбельна на
телефоне: управление построено на клавиатуре и захвате указателя, которых там
нет.

- [x] **Тач-управление** — виртуальный стик для ходьбы, свайп для обзора, тап по
      грибу вместо прицела с `E`. Готово: `game/touchControls.ts` — новый модуль,
      не порт. Race-the-city's `ui/touchControls.ts` оказался про совсем другой
      жанр (кнопки газ/тормоз/руль для машины) — от него взят только сам приём
      (pointer-events + `setPointerCapture`-стиль обнаружение `pointer:coarse`),
      не код: у FPS-прогулки нет аналога руля, нужен стик+свайп+тап, которых
      там просто не было к чему адаптировать (тот же урок про "донор кода
      решает наш класс задачи", что уже в CLAUDE.md про buildings/carriageways
      из geo-модулей — здесь этим классом задачи оказался жанр игры, не гео).
      `createTouchControls(dom, sensitivity)` возвращает ТОТ ЖЕ интерфейс, что
      `createControls` (`read(dt): PlayerInput`), так что `stepPlayer` не знает
      о вводе ничего нового; `main.ts` просто предпочитает `touch.read()`
      `controls.read()`, когда `touch.active` (сборка `matchMedia('(pointer:
      coarse)')`, как и было в доноре). Левая половина экрана — стик (сдвиг
      пальца от точки касания даёт `forward`/`strafe`, та же конвенция, что и
      у WASD, `stepPlayer` не меняется); правая — свайп-обзор (те же
      `dYaw`/`dPitch`, что и у мыши в `controls.ts`, только источник дельты —
      `PointerEvent.clientX/Y` между кадрами, а не `movementX/Y`, раз захвата
      указателя на тач нет). Короткое касание правой половины без заметного
      сдвига — тап; `nearestInView` (`game/pick.ts`) получил пятый параметр
      `point: THREE.Vector2` (по умолчанию центр экрана) — тот же raycaster,
      просто прицелен в точку тапа на экране, а не в центр, так что палец
      целится прямо в гриб, а не в невидимый крестик. Внутри `touchControls.ts`
      — свои DOM-элементы (кольцо+кружок стика, видны только пока палец на
      экране) для обратной связи, иначе левая половина экрана нетача-открываема
      "на ощупь". Чистая логика (`joystickVector`, `isTap`, `screenToNdc`)
      покрыта юнит-тестами; DOM-проводка — нет, тот же выбор, что и везде в
      `ui/`. Живая проверка: headless Chrome с `Emulation.setTouchEmulationEnabled`
      + `Input.dispatchTouchEvent` подтвердила `pointer:coarse` детектится,
      палец на левой половине классифицируется как стик и включает
      кольцо/кружок, тап на правой — как тап; полный скриншот с открытым
      кольцом не дался (headless-эмуляция тача иногда шлёт неожиданный
      `pointercancel` через сотню мс — похоже на артефакт самого CDP, не баг
      игры), доверился прямому логу внутри обработчиков вместо кадра. Попутно
      найдено и исправлено: клик по канвасу вызывал `requestPointerLock()`
      безусловно (`game/controls.ts`) — на тач-устройстве Pointer Lock не имеет
      смысла и каждый тап кидал необработанный `NotAllowedError` в консоль;
      добавлена проверка `pointer:coarse` плюс `.catch()` на случай отказа и на
      обычном мышином устройстве тоже.
- [x] **Экранные кнопки** вместо `Tab` и `Q`: энциклопедия, корзина, приседание.
      Готово: `ui/cornerButtons.ts` — портированная из race-the-city чистая
      геометрия (`cornerRight(i)`), подогнана под уже существующую шестерёнку
      настроек (32px/16px, не 44px/16px race-the-city) вместо своих отступов —
      кнопка энциклопедии и разбора корзины встают в тот же верхне-правый ряд,
      `hidden` по умолчанию и показаны только когда `touch.active` (`ui/hud.ts`
      получил третий параметр `TouchButtons`). Кнопка приседания — не в этом
      ряду, а в `game/touchControls.ts` (bottom-center) вместе с остальным
      тач-вводом, поскольку это удержание, а не одноразовое действие: сама
      живёт в замыкании модуля и просто пишет в `crouching`, которое `read()`
      уже отдаёт в `PlayerInput` каждый кадр — тот же путь, что у стика.
      Счётчик корзины (`#basket`, низ-право) не трогали — он и так просто
      текст, не кнопка. Проверено скриншотом дважды: на десктопе (без
      `pointer:coarse`) видна только шестерёнка, как раньше; под мобильной
      эмуляцией (`Emulation.setDeviceMetricsOverride`) — все три кнопки в
      верхнем углу плюс кнопка приседания снизу-по-центру.
- [x] **Портретная раскладка** для энциклопедии и карточки вида. Готово —
      осознанное отступление от исходной формулировки пункта: не две вкладки, а
      вертикальный стек (модель сверху ~40vh, карточка снизу, своя прокрутка).
      Вкладки прятали бы 3D-модель, пока читаешь текст, а осмотр гриба в упор —
      как раз то немногое, ради чего «смотреть глазами» вообще в CLAUDE.md
      (см. «Conventions») — простой стек не жертвует ни тем, ни другим и не
      требует своего JS-состояния переключения. Новый `ui/responsiveStyle.ts`'s
      `ensureStyleOnce(id, css)` — единственный способ выразить `@media` для
      кода, который иначе везде красит DOM через `style.cssText`
      (`@media` нельзя выразить инлайн-стилем) — вставляет один `<style>` при
      первом открытии `ui/inspect.ts`/`ui/encyclopedia.ts`, не дублируя тег на
      каждый повторный вызов. `#inspect`'s `@media (max-aspect-ratio: 4/5)`
      переключает `flex-direction` на `column` с `!important` (нужен, чтобы
      перебить собственный инлайн `flex`/`max-width` панелей, без протаскивания
      "это телефон?"-флага через всю функцию); энциклопедии досталось только
      сужение отступов (34/38px → 16/14px) — её сетка (`auto-fill`) и так сама
      переукладывается в один столбец. Проверено вживую скриншотом в реальном
      портретном вьюпорте (390×844, `Page.captureScreenshot` без эмуляции
      тача — это чистый CSS-медиа-запрос, не про сам тач) — энциклопедия
      читаема, карточка вида показывает и модель, и текст с прокруткой;
      осмотр карточки потребовал временного debug-входа в `main.ts`
      (`?inspectDemo=1` → прямой вызов `openInspect`, в обход геокодинга/леса)
      — тот же приём "подменить, снять скриншот, вернуть перед коммитом", что
      уже стоял для ручья/шелтера/хвойных; `git diff` на `main.ts` пуст.
- [ ] **Бюджет производительности.** 243 гриба и полторы тысячи деревьев тянет
      десктоп; на телефоне нужны более агрессивное отсечение по дальности,
      меньше сегментов в телах вращения и, вероятно, инстансинг грибов одного
      вида. Мерить на реальном устройстве, а не на эмуляции. **Still
      genuinely blocked on a real device this session** — re-checked
      2026-09-11 alongside the live-report FPS complaint. What this session's
      other work does give a mobile pass to build on later, without being one
      itself: real distance culling for static scatter now exists
      (`world/instanceCulling.ts`, see «…но БЕЗ отсечения по дальности»
      above) with its radius as one named constant
      (`main.ts`'s `SCATTER_CULL_RADIUS`) — a mobile-specific quality tier
      could plausibly just lower that number (and the sweep interval) rather
      than invent its own culling mechanism from scratch. Not built here: a
      lower-radius tier is a product/UX call (automatic by device detection?
      a settings toggle? how much smaller a radius actually still looks
      right?) the same way the instancing compromise is — not something to
      decide unilaterally from a headless test run. "Меньше сегментов в телах
      вращения" and instancing itself remain exactly as open as before.
- [x] **PWA** — офлайн-запуск и иконка на домашний экран. Готово:
      `public/manifest.webmanifest` (иконка — тот же `favicon.svg`, `sizes:
      "any"` для svg вместо растеризации в PNG нескольких размеров) +
      `public/sw.js`, оба просто копируются vite в `dist/` как статика, без
      новой зависимости (vite-plugin-pwa и т.п. не подключался — та же
      причина, что и у остального рантайма: `three`/`yaml` и всё). **Первая
      же попытка (пассивное «кешируй, что зафетчили») не сработала** —
      проверено скриншотом/скриптом же способом, что и остальной живой
      верификации: реальный офлайн-релоад после первого онлайн-визита не
      находил в кэше НИЧЕГО. Причина в самой природе Service Worker API:
      только что зарегистрированный воркер не берёт под контроль ту самую
      страницу, что вызвала `register()`, пока не завершит install+activate —
      к этому моменту первая пачка запросов страницы (`index.html`, сам
      хэшированный JS) уже ушла по сети напрямую, `clients.claim()` в
      `activate` закрывает окно только для того, что ещё не долетело, а к
      этому моменту обычно долетело уже всё. **Настоящий фикс** — активное
      предзакеширование в `install`: воркер сам фетчит `./index.html`,
      регуляркой достаёт из него текущие `<script src>`/`<link href>` на
      `./assets/...` (хэш в имени файла вообще не хардкодится — читается из
      того же `index.html`, который и так уже под рукой) и кладёт их в кэш
      явно, не дожидаясь, пока их кто-то запросит. Дальше `fetch`-обработчик
      — тот же stale-while-revalidate, что и в первой версии, просто уже не
      единственная линия защиты. Проверено вживую CDP-скриптом:
      `Network.emulateNetworkConditions({offline:true})` + `Page.reload` —
      `window.__READY` становится `true` без единого сетевого запроса.
      **Урок:** для PWA-офлайна пассивное кеширование "по факту запроса" —
      известная ловушка именно из-за порядка register→install→activate;
      нужно либо явное предзакеширование (как здесь), либо сервис-воркер,
      зарегистрированный ДО первой навигации (что для SPA без своего
      бэкенда/SSR всё равно не покрыло бы самый первый визит).
- [x] **Экран согласия недостижим на телефоне — игру не начать.** Живой
      репорт 2026-09-10 со скриншотом: чёрный экран, виден только HUD и
      кружок с стрелкой вниз (на деле — кнопка «присесть» из
      `touchControls.ts`, `crouchBtn`, с явным `z-index:42`, а не кнопка
      закрытия чего-либо — воспринята как таковая только потому, что была
      единственным различимым интерактивным элементом на экране).
      Воспроизвести headless-скриншотом с фиксированным вьюпортом не
      удалось (экран согласия рендерился нормально) — воспроизвелось только
      после того, как пользователь подтвердил баг и в обычном мобильном
      браузере, не только внутри Telegram: значит, дело не во встроенном
      браузере конкретно. Настоящая причина — общая для `main.ts`'s
      `overlay()` (экран согласия, помощь, разбор корзины, подтверждение
      выхода): контейнер `position:fixed;inset:0` центрировал содержимое
      флексом (`align-items:center`) без `overflow`, а реальный мобильный
      браузер занимает часть экрана своей строкой адреса динамически —
      `inset:0` этого не знает и растягивается на "большой" вьюпорт, так что
      контент может оказаться выше или ниже фактически видимой области без
      возможности прокрутки туда. Хуже: центрирование и прокрутка на ОДНОМ
      и том же элементе — известный баг флексбокса, обрезает недостижимую
      часть, а не даёт её проскроллить. Исправлено разделением ролей:
      внешний `overlay()`-контейнер теперь только скроллит
      (`overflow-y:auto`), а центрирует — новая внутренняя обёртка
      (`min-height:100%;display:flex;align-items:center`) — так что кнопка
      всегда физически достижима прокруткой, сколько бы места ни съело чужое
      браузерное окружение. Проверено CDP-скриптом с намеренно заниженным
      `Emulation.setDeviceMetricsOverride` (220px высоты против ~340px
      содержимого) — кнопка `#ok` начинается за пределами вьюпорта, но
      `scrollIntoView` подтверждает физическую достижимость
      (`btnReachableAfterScroll: true`); полный набор тестов и `boot-check`
      зелёные. Задел на будущее, не тронуто в этот раз: тот же
      пользовательский репорт заодно упомянул отсутствие сенсорных кнопок на
      планшете «пару релизов назад» — без модели устройства и повторяемости
      чинить это вслепую означало бы риск регресса для гибридных
      ноутбуков/планшетов с реальной мышью (`pointer:coarse` — единственный
      признак активации тач-режима в `touchControls.ts`, расширение его
      OR-условием `ontouchstart`/`maxTouchPoints` увело бы такие устройства
      с клавиатуры на сенсорный ввод насильно) — нужны конкретные
      модель/браузер, прежде чем трогать эту эвристику.

## 🌍 Биомы за пределами леса

Все девять биомов схемы теперь заселены — по каждому есть хотя бы один вид
(дюны: *Psathyrella ammophila*; болото: *Russula emetica*; высокогорье:
*Leccinum scabrum*, *Hygrocybe conica*; штольни: *Pleurotus ostreatus*,
*Coprinellus micaceus*; опушки: *Agaricus campestris*, *Coprinus comatus*,
*Macrolepiota procera*), а `world/biome.ts` из плана 2 уже определяет биом
точки по тегам OSM и высоте. Дальше — не данные, а мир:

- [x] **Дюны и болото — пока только цвет земли, не рельеф.** Готово
      (v0.41.0): `terrain/relief.ts`'s `withBiomeRelief()` — декоратор
      `ElevationProvider` того же вида, что `withPits`/`withDetail`, вместо
      правки `terrain/procedural.ts` (биом — это OSM-полигон, ему нечего
      знать о высоте). Дюна — сложенная синусоида-гряда плюс подмешанный
      шум для неровности; болото — один октав `fbm2` мельче и слабее (кочки
      и мочажины, не гряды). Наложен в `game/loadForest.ts`'s `buildSource`
      ПОСЛЕ того как биом уже посчитан по исходному грунту, но ДО
      размещения деревьев — иначе дерево на краю дюны стояло бы не на том
      бугре, на котором его потом видит игрок. Проверено скриншотом
      (временно раздвинут лесной полигон демо-леса и подставлена
      песчаная/болотная зона рядом с домиком) — дюна видна грядой на
      горизонте, болото — мельче и мягче, оба вернулись перед коммитом.
- [x] **Интерьер штольни.** Вход берётся из OSM (`cave_entrance`, `adit`,
      `mineshaft`); `world/biome.ts`'s `cave-adit` was only an invisible
      12m-radius tag around the point steering nearby mushroom spawn — no
      entrance mesh, no interior. Re-checked this session: my own earlier
      read of this as needing a new architecture (a teleport, a separate
      scene) was wrong — `world/shelter.ts` already IS the exact precedent,
      a real walkable interior built as ordinary ground-level geometry, no
      teleport at all. `world/mine.ts` (new) follows it: `placeMine` sits
      at a real `CaveEntrance` (`geo/parse.ts`) — no procedural fallback,
      unlike the shelter, since a tunnel at an arbitrary point wouldn't
      mean anything the way a hut in a clearing does. OSM never records
      which way a mapped entrance faces, so the heading is read off the
      terrain itself (whichever of 12 candidate directions climbs the most
      over 8m is "into the hillside") rather than guessed or seeded.
      `mineObstacles` (two side walls + a dead-end back wall, the same
      wall-circle-chain technique as `wallObstacles`) and `buildMineMesh`
      (floor/ceiling/walls plus a lantern `PointLight` — same small-shadow-
      map recipe as the hearth light) round it out. Wired in `scene.ts`
      only when `source.caves` actually has an entry in range — the demo
      wood never does (`world/demoForest.ts`'s `caves: []`), same honest-
      null pattern as the fisherman's hut with no water. Verified: 6 unit
      tests (heading picks the real uphill direction, deterministic,
      obstacles span both sides plus the back) and a live headless
      screenshot with a temporarily synthesized demo-wood entrance (TEMP
      DEBUG, reverted, `git diff` empty before commit) — a real structure
      in the wood with a dark tunnel mouth and the lantern's warm glow
      spilling out, sitting on the ground at a plausible scale next to the
      shelter. Not yet tested against a real OSM-mapped entrance (network-
      dependent, no guaranteed location to try) — the terrain-fit at a
      genuinely steep real hillside remains unverified.
- [ ] **Второй вид дюнного гриба** — *Peziza ammophila* растёт там же, что и
      *Psathyrella ammophila*, но морфологически это чашевидный аскомицет без
      привычной шляпки и ножки — та же проблема схемы, что и с трюфелем ниже,
      только менее радикальная. Re-checked this session: genuinely blocked,
      not bounded — `species/schema.ts`'s `MushroomMorphology` requires a
      cap (`CAP_SHAPES` has no cup/goblet shape) and a stipe (`height: Range`,
      not optional), and there is no second `kind` for an apothecium body
      plan the way `berry`/`herb`/`nut`/`find` each get their own. Needs a
      schema decision (new morphology variant, or an optional stipe + a cup
      cap shape) before any geometry work — same "decide together" class of
      problem as the truffle, not a code task to just pick up.

## 🗺️ Infinite world (chunked generation)

Live request 2026-09-10: "no edges, keep walking." Brainstormed and
partly shipped in the same session — see docs/superpowers/specs/
2026-09-10-infinite-world-design.md for the full design and the "Scope
actually shipped this pass" section this list mirrors.

- [x] **Chunked streaming for the offline/demo wood.** Done:
      `world/chunking.ts` (grid math, chunk seeding), `game/worldStream.ts`
      (the chunk manager itself — builds terrain, trees and mushroom/
      berry/herb/nut/find ecology one chunk at a time around the player,
      throttled to one real chunk build per `update()` call so a sudden
      burst of newly-needed chunks doesn't stall a render frame for
      seconds), and origin-parameterised `placeTrees`/`buildGround`/
      `buildSites`/`griddedProvider` underneath it (all backward-
      compatible — every existing caller is unaffected). The reserved
      home-plot chunk (0, 0) is never generated by the streamer; the demo
      wood's own home plot always builds at exactly `CHUNK_SIZE / 2`
      (`game/loadForest.ts`), regardless of the world-size picker, so the
      two never straddle each other's edge. Verified by the module's own
      test suite (chunk lifecycle, determinism, the home-chunk exclusion,
      obstacle/mushroom-object bookkeeping) and a live headless screenshot
      at world (250, 0) — well outside the ±200 home radius — showing
      continuous ground and trees, no seam, no void.
- [ ] **Real-place (named OSM location) chunking — not done.** The harder
      half of the original ask: incremental Overpass/DEM tiling as the
      player approaches a new chunk, with a silent per-chunk fallback to
      procedural generation on any fetch failure or missing OSM data (the
      brainstormed decision — see the design doc). Deferred, not
      abandoned: the design doc explains the halfSize-vs-chunk-grid
      reconciliation problem that had to be solved for the demo wood
      first (chunk (0, 0) must exactly contain the home plot, or chunks
      either overlap-and-duplicate or leave a gap) — the same fix applies
      here, but real-place mode's `halfSize` also has a real network/
      rate-limit cost the demo wood's does not, so it cannot simply be
      forced to `CHUNK_SIZE / 2` the same way without changing what a
      player actually asked for.
- [x] **Landmarks, wildlife and decorative scatter stay confined to the
      home plot.** Done this session in two passes:
      1. Hares and squirrels now follow the player into streamed chunks:
         `game/worldStream.ts`'s `buildChunk` places 2 of each per chunk
         (`placeCritterHomes`, `createHares`/`createSquirrels`,
         `world/critters.ts`), seeded off the chunk the same way its
         trees/sites are, disposed alongside it when it unloads. Needed
         `util/openSpot.ts`'s `findOpenSpot` to grow an optional
         `worldCenter` param first — its clearance bound was always
         measured from world (0, 0), so a chunk far from the origin would
         have failed that bound at every candidate and silently returned
         an unchecked, possibly-inside-an-obstacle spot.
      2. Boulders, deadwood (logs/stumps/leaning trees), undergrowth and
         flora/grass also now scatter per chunk, at their own home-plot
         default densities — `placeBoulders`/`placeLogs`/`placeStumps`/
         `placeLeaningTrees`/`placeBushes`/`placeFlora`/`placeGrass` all
         gained the same optional `chunkOrigin` param. **Measured, not
         guessed:** feeding their spawn points into `buildSites` the way
         the home plot does (real deadwood/moss ecology sites) was tried
         first and reverted — it pushed one chunk's site count from 200 to
         ~950 and its own build cost from ~20ms to ~78ms, enough to take
         the whole `worldStream.test.ts` suite from ~30s past two minutes
         across the many chunks its tests build. Shipped as visual-only
         scatter instead (no ecology-site feed), which measured back at
         the original ~30-35s suite time.
      Verified by `worldStream.test.ts` (creation/disposal tracking a
      chunk's own lifecycle for both passes) and live headless runs 900m
      out — `hares`/`squirrels` groups and visible boulders/scatter in the
      scene graph as chunks streamed in, no console errors beyond the
      already-documented headless Pointer Lock limitation. Deliberately
      NOT extended: the hut, campfire, fisherman's hut, wild hive/bees,
      dragonflies, snakes (their home-plot count — "two to a wood" — means
      something only if it doesn't repeat per chunk) — each is a
      one-per-wood landmark, not a follow-up.
- [x] **"Размer участка" (world-size picker) loses its old meaning for the
      demo wood.** Done — no design pass actually needed: `go()` itself
      already falls back to the demo wood on an empty query (same as
      `#place-demo`), so the size control was already irrelevant whenever
      the input was empty, not just for one specific button. `ui/
      placePicker.ts` now shows the size row only once there is text in the
      place field — mechanical, not a UX guess (it exactly mirrors the
      existing `q.length > 0 ? q : null` branch `go()` already had), and it
      is gone the instant the field is cleared again. The popular-place
      shortcut buttons still bypass it (fixed at `DEFAULT_WORLD_SIZE`) — a
      quick-pick reasonably trading configurability for one click, not
      revisited here. Verified live: hidden on load and once the field is
      cleared, reappears the moment a character is typed.
- [x] **Chunk build cost is still a real, if now much smaller, per-frame
      stall.** `BUILD_BUDGET_PER_UPDATE` (1 chunk per `update()` call,
      `game/worldStream.ts`) turns "freeze for seconds" into "an
      occasional frame worth several hundred ms," not into "free." A
      proper fix — building off the main thread (a Worker), or slicing a
      single chunk's own generation across several frames instead of
      budgeting whole chunks — is real future work once this is actually
      played on a real device, not just profiled in a test. **Partially
      done (2026-09-11 live-report batch):** measured where a chunk's own
      ~150-250ms build cost actually goes (`test/game/worldStream.test.ts`
      didn't have a timing benchmark before this session; one was added).
      Breakdown for one chunk (~130 placements) in this session's own
      environment: terrain + trees + decorative scatter + ecology sites
      together cost roughly 100-130ms, but building the placements
      themselves — each mushroom/berry/herb/nut/find's real, merged mesh
      (`collectible/placement.ts`'s `buildPlacementObject`, dominated by
      `buildCollectible`'s own procedural geometry) — cost another
      110-150ms **on top of that**, easily the single biggest piece, bigger
      than every scatter system (grass included) combined. That piece is now
      sliced: `buildChunk` still builds a chunk's terrain/trees/scatter/sites
      synchronously (unchanged), but no longer builds any placement's real
      object in the same call — `placements: Placement[]` is computed and
      stored with a `placementCursor`, and a new `advancePlacements()` builds
      `PLACEMENT_BUDGET_PER_UPDATE` (16) of them per `update()` call, spread
      across however many chunks are still mid-build, same idea as
      `BUILD_BUDGET_PER_UPDATE` one level deeper. `pendingChunkCount()` now
      also counts chunks still mid-placement-build, so `WorldStream`'s own
      contract ("0 once caught up") stays true for callers. Verified with
      three new tests: placements provably arrive gradually across several
      `update()` calls rather than all at once, no single call ever adds more
      than the budget, and a wall-clock regression guard
      (`test/game/worldStream.test.ts`) keeps a placement-only `update()`
      call well under the old unsliced per-chunk placement cost (a
      deliberately generous threshold — a regression guard against
      "someone re-inlines the loop," not a tight perf number, since
      wall-clock timings don't port across CI hardware). **Honest limit:**
      the terrain/trees/scatter/sites half of a chunk build (~100-130ms) is
      NOT sliced — still one synchronous stall per newly-needed chunk. That
      would need untangling real interdependencies (trees need ground, sites
      need trees, etc.) into resumable steps, or the Worker-based rewrite —
      both too large a change to also land safely in this same session, and
      the smaller, lower-risk win (removing the placement cost from being
      bundled into that same stall) was worth taking on its own rather than
      attempting both at once.

## 🍂 Игра

- [ ] **Сезоны и календарь.** Сейчас в лесу вечный сентябрь после дождя.
      Календарь превращает `season` из фильтра в механику: за одну вылазку всех
      видов не собрать, надо возвращаться. Re-checked this session: not a
      pure code task — the mechanic's actual shape is a game-design call
      the code cannot make on its own (how much real time per in-game
      season, whether returning days later is fun pacing or just friction,
      whether the calendar advances on its own or only when the player
      chooses to "wait"). Needs that decision before there is anything
      concrete to build against `species.ecology.season`.
- [x] **Собственные заметки к находке** — где нашёл, дата, своя пометка. Готово
      (v0.42.0): `Find.note?` (`save/store.ts`) + чистая `setFindNote(save,
      at, note)` в том же стиле, что `applyFind` (новый объект, старый не
      трогает). `at` (`Date.now()` в момент сбора) — это же и есть
      идентичность находки, отдельный id не понадобился. В «Разборе
      корзины» (`Q`) у каждой карточки — своё текстовое поле, привязанное к
      находке через `WeakMap<Placement, number>` (единственное место, где
      объект помещения и его будущая запись сейва точно встречаются —
      момент сбора), не через сопоставление по координатам/виду. Поле
      сохраняет по `blur`, не по каждой нажатой клавише.
- [x] **Экспорт энциклопедии** — картинкой или страницей, чтобы было чем
      похвастаться. Готово (v0.43.0): кнопка «Экспорт картинкой» в
      энциклопедии рисует найденные виды (только `discovered`, не весь
      список — хвастаться нечем найденным чужой рукой) на обычном 2D
      `canvas` — те же превью, что уже рендерит `renderCollectiblePreview`,
      просто собранные в сетку с подписями — и предлагает браузеру обычное
      скачивание PNG. Сеточная арифметика (`ui/export.ts`'s `layoutGrid`/
      `columnsFor`) — чистые функции, вынесены отдельно от
      `canvas`/`Image`, которых нет в `node`-окружении тестов
      (`vite.config.ts`), и покрыты юнит-тестами; сама отрисовка и
      скачивание — не тестируются, тот же выбор, что уже стоит для
      остального DOM-кода в `ui/`.

## 🔧 Внутреннее

- [ ] **Подземные грибы (трюфель и родственные) не влезают в схему.** У
      трюфеля нет ни шляпки, ни ножки, ни открытой поверхности со спорами —
      только сплошная мякоть под землёй, а спороносный слой запечатан внутри.
      `morphology: { cap, stipe, hymenium }` рассчитана на надземный гриб с
      этими тремя частями по определению; втиснуть в неё трюфель значило бы
      написать заведомо неверные данные — ровно то, чему посвящён весь проект,
      поэтому он сознательно не добавлен в базу. Нужны: (1) отдельный тип тела
      в схеме и генераторе для гипогейных/гастероидных грибов (тот же класс
      задачи, что и дождевик-Lycoperdon, и вторая дюнная *Peziza ammophila* из
      раздела биомов); (2) отдельная механика находки — трюфель физически
      нельзя увидеть и подобрать прицелом, как обычный гриб, его ищут по
      запаху (в природе — с собакой или свиньёй), значит нужен принципиально
      другой интерфейс поиска, не «подошёл — E».
- [x] **LOD для грибов.** Готово: `collectible/worldMesh.ts`'s `buildLodProxy`
      + `buildCollectibleLod` — каждый собранный `toWorldMesh()`-меш теперь
      обёрнут в `THREE.LOD` с двумя уровнями: настоящая геометрия до
      `LOD_DISTANCE` (18м), дешёвый силуэт дальше — жёсткое выключение на
      45м (`main.ts`'s `cullDistantMushrooms`) осталось как было, снаружи
      обоих уровней LOD, а не заменено им. Силуэт — один 6-гранный конус,
      посаженный на bounding box настоящего меша и залитый одним цветом,
      усреднённым из его же запечённых per-vertex цветов (не заглушка
      фиксированного цвета — лисичка так и останется жёлтым пятном,
      сыроежка красным). Функция не знает про конкретный вид/kind — тот же
      принцип, что уже у `toWorldMesh`, один код на гриб/ягоду/находку.
      `Forest.updateMushroomLod(camera)` — новый метод, `three.js`'s `LOD`
      не переключает уровень сам, нужен вызов `.update(camera)` каждый
      кадр; `game/scene.ts` держит отдельный список `lods: THREE.LOD[]`
      (не то же самое, что `mushroomObjects` — там для ягоды/находки уже
      стоит `withPickHitbox`-обёртка снаружи LOD, а обновлять нужно сам LOD
      изнутри неё). Прицел (`game/pick.ts`) ничего не потребовал менять:
      `THREE.LOD.raycast()` сам тестирует только активный на данный момент
      уровень, той же дистанцией от камеры, что и видимый уровень.
      Юнит-тесты: совпадение bounding box, дешевизна (число вершин), верный
      цвет, переключение уровня по дистанции — `LOD.update()` и
      геометрическая математика работают в node без WebGL-контекста, тестов
      достаточно; живая проверка — скриншотом (лес рендерится, ошибок в
      консоли нет), сам стартовый ракурс не задел ни одного гриба вблизи.
- [ ] **Инстансинг грибов одного вида.** 243 меша — 243 вызова отрисовки.
      Экземпляры различаются геометрией, так что понадобится либо несколько
      готовых вариантов на вид, либо атлас. **Сознательно не тронуто** в
      этом заходе — в отличие от LOD (чистый выигрыш, детальная геометрия
      вблизи не меняется), инстансинг по "нескольким готовым вариантам"
      означает то же самое компромиссное решение, что уже стоит у деревьев
      (`CONIFER_SHAPES`/`BROADLEAF_CROWNS`) — конечный набор форм вместо
      честного "нет двух одинаковых", специально выделенного в другом
      пункте TODO как ценность игры ("В реальности нет двух одинаковых
      грибов"). Это компромисс дизайна, не только код, стоит решать вместе
      с пользователем, не в одиночку.
- [x] **Тест на регрессию силуэтов.** Готово, но не как автоматический
      pass/fail-тест: `npm run silhouette-sheet` (`scripts/silhouette-sheet.mjs`
      + `scripts/silhouetteSheet.entry.ts`) рендерит силуэт каждого вида (тот
      же `silhouette`-режим `ui/preview.ts`'s `renderCollectiblePreview`, что
      уже красит нераскрытый вид в энциклопедии) на один общий лист — раскладка
      переиспользует `ui/export.ts`'s `columnsFor`/`layoutGrid`, ту же
      арифметику, что уже красит экспорт энциклопедии картинкой. Осознанно НЕ
      автоматический diff против эталона и НЕ в CI, тем же принципом, что уже
      держит `boot-check` вне `.github/workflows/deploy.yml` — точные пиксели
      плывут между GPU/драйверами, а вот держать инструмент под рукой для
      человеческого "осмотра глазами" по всему списку видов разом (сейчас 43,
      по одному скриншоту на вид уже не набегаешься) — именно то, что дважды
      ловило баги, которых не видели тесты. Первый прогон по всем 43 видам
      ничего подозрительного не нашёл — лежащая на боку вешенка (`pleurotus-
      ostreatus`) оказалась верной (боковая ножка по дизайну, не баг), рваный
      край шляпки гриба-зонтика (`macrolepiota-procera`) — честное отражение
      `surface: scaly` в данных.
- [x] **CHANGELOG.md** — когда релизов станет больше двух. Готово: порог давно
      пройден (56 релизов на момент написания) — одна строка на версию,
      собрана из заголовков коммитов и `git log` между тегами (многие ранние
      версии несли только `chore: версия X.Y.Z` в коммите самого тега,
      настоящее описание — в предыдущих коммитах той же ветки).
