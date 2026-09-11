# CHANGELOG

Одна строка на релиз, сверху вниз от новых к старым. Что именно и почему —
в истории коммитов и `TODO.md` (раздел «известные шероховатости» держит
живые баг-репорты и их разбор); здесь только краткая сводка того, что вышло.
Разработка идёт по `TODO.md`; релиз — тег `vX.Y.Z`, публикуется на
[GitHub Pages](https://kryadov.github.io/itffm/) зелёной сборкой с `master`.

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
The "Размер участка" (world-size) picker now hides itself whenever it
would have meant nothing — an empty place field already falls back to the
demo wood, size and all.

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
LOD для собранных находок — дешёвый силуэт (конус на bounding box, цвет
усреднён из запечённых вершинных цветов) дальше 18м, настоящая геометрия
ближе.

## v0.55.0
Звук сбора гриба — короткий синтезированный «щелчок» (шумовой всплеск через
highpass), не CC0-запись: тот же принцип «рисуем без картинок», применённый
к звуку.

## v0.54.0
PWA — офлайн-запуск и иконка на домашний экран. Сервис-воркер
предзакеширует текущий бандл в `install`, а не пассивно по мере запросов.

## v0.53.0
Портретная раскладка энциклопедии и карточки вида — вертикальный стек вместо
двух узких колонок на телефонном экране.

## v0.52.0
Экранные кнопки для тач-устройств — энциклопедия, разбор корзины, присесть.

## v0.51.0
Тач-управление — виртуальный стик для ходьбы, свайп для обзора, тап прямо по
находке вместо прицела с `E`.

## v0.50.0
Землянка ставится на настоящую отмеченную в OSM хижину/вышку, если такая
есть в этом месте, а не только процедурно.

## v0.49.0
Fix: ягоды растут на настоящем кусте с ветками и листьями, не кластером сфер
в воздухе — заодно решило и старую жалобу «ягоды не собираются».

## v0.48.0
Землянка — настоящие рамы на окнах, убран протекающий из-под пола свет,
охапка дров и колодец рядом; постоянный `?debug=1`/`F3` оверлей для живой
отладки прицела.

## v0.47.0
Fix: ягоды/травы/находки теперь прицеливаются той же логикой, что и гриб —
невидимый хитбокс по размеру модели вместо отдельного углового кода.

## v0.46.0
Fix: конус прицеливания для мелких находок; деревья больше не растут поверх
тропинок.

## v0.45.0
Подстилка лесного пола — шумовые пятна тёмной земли вместо ровной заливки.

## v0.44.0
Fix: конус прицеливания для мелких находок гасился любой травинкой на луче.

## v0.43.0
Экспорт энциклопедии картинкой — сетка найденных видов, обычное скачивание
PNG.

## v0.42.0
Свои заметки к находке — где нашёл, что запомнилось, в «Разборе корзины».

## v0.41.0
Рельеф дюн и болота — гряды и кочки, не только цвет земли.

## v0.40.0
Ручьи, водопады и родники — лента вдоль русла, а не одна плоская панель.

## v0.39.0
Птицы — взлёт, полёт, посадка, наземная возня; последний крупный перенос из
race-the-city.

## v0.38.0
Мини-карта — по умолчанию выключена, компас остаётся основным ориентиром.

## v0.37.0
Хвойные деревья — своя крона на каждый род, не один конус на всех.

## v0.36.0
Постоянная подсказка по управлению (`H`) во время ходьбы.

## v0.35.0
Номер версии на титульном экране; три живых фикса подряд (возврат мыши после
осмотра, дрожь камеры, углы землянки).

## v0.34.0
Покачивание камеры и ритм шага; фиксы `E` на мелких находках и тропинки за
краем участка.

## v0.33.0
Землянка — окна, дверь, труба с дымом, свет ночью, объёмнее стены.

## v0.32.0
Подлесок растёт пятнами, не ровным газоном.

## v0.31.0
Полу-поваленные деревья.

## v0.30.0
Запрыгнуть на валун, пень или тонкое бревно, если высота позволяет.

## v0.29.0
След потревоженной подстилки на месте сбора.

## v0.28.0
Корзина в 3D — карточки-превью реальных экземпляров вместо счётчиков.

## v0.27.0
Экран загрузки — вращающийся гриб и прогресс-бар по стадии загрузки.

## v0.26.0
Находки — пятый и последний `kind` лесных находок (птичье гнездо, рог,
камень).

## v0.25.0
Орехи — четвёртый `kind` (лещина, жёлудь).

## v0.24.0
Травы — третий `kind` (крапива, черемша, щавель).

## v0.23.0
Морошка — четвёртая ягода, единственная на болоте.

## v0.22.0
Ягоды — второй `kind` собираемого; `Species` стал дискриминированным
объединением по `kind` вместо только грибов.

## v0.21.0
Кнопка настроек в углу экрана; посадочные точки на деревьях для будущих
птиц.

## v0.20.0
Фонарик на `F`.

## v0.19.0
Погода — дождь, снег, туман.

## v0.18.0
Дюны и болото — цвет земли и физика ходьбы; срезать гриб, не только
собрать.

## v0.17.0
Номер версии в углу экрана; выход в меню на `Esc`.

## v0.16.0
Смена дня и ночи — режимы день/ночь/цикл.

## v0.15.0
Меню настроек — скорость ходьбы, чувствительность мыши, дальность
прорисовки, язык.

## v0.14.0
Водоёмы — поверхность, юбка по берегу, источник влажности для экологии.

## v0.13.0
Тропинки — земляная лента вдоль путей из OSM.

## v0.12.0
Облака, переносимые над лесом.

## v0.11.0
Небо — купол с градиентом, солнцем и звёздами вместо плоской заливки.

## v0.10.0
Гриб прячется за травой и подлеском от прицела, не только от глаза.

## v0.9.0
Трава — гуще во влажных низинах.

## v0.8.0
Размер участка настраивается на экране выбора места; фильтры в энциклопедии
— биом, съедобность, гименофор, сезон.

## v0.7.0
Случайные ямы и западины в рельефе; поляны и опушки внутри леса.

## v0.6.0
Список известных лесов на экране выбора места; ведьмино кольцо шампиньона;
землянка (первая версия — точка старта игрока); цветы, папоротник,
кустарник.

## v0.5.0
Склон замедляет подъём, прыжок, компас, честный выбор точки старта, формы
крон деревьев, валежник, валуны.

## v0.4.0
База видов расширена с 3 до 25 — сморчок, строчок, груздь, подосиновик,
лисичка ложная и другие.

## v0.3.0
Реальная география — план 2 завершён: лес строится из настоящего места по
OpenStreetMap и AWS Terrain Tiles, с офлайн-демо-лесом как честным
запасным вариантом.

## v0.2.0
Играбельный срез целиком — план 1 завершён (задачи 1-17).

## v0.1.0
Первая играбельная версия — задачи 1-6.
