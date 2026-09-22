import { t, getLang, setLang, type Lang } from '../i18n/i18n'
import { TIME_MODES, type TimeMode } from '../world/daynight'
import { WEATHERS, type Weather } from '../world/weather'
import type { Prefs } from '../save/store'

const TIME_MODE_KEY: Record<TimeMode, 'timeCycle' | 'timeDay' | 'timeNight'> = {
  cycle: 'timeCycle',
  day: 'timeDay',
  night: 'timeNight',
}

const WEATHER_KEY: Record<Weather, 'weatherClear' | 'weatherRain' | 'weatherSnow' | 'weatherFog'> = {
  clear: 'weatherClear',
  rain: 'weatherRain',
  snow: 'weatherSnow',
  fog: 'weatherFog',
}

export interface SettingsCallbacks {
  onLangChange: (lang: Lang) => void
  onPrefsChange: (prefs: Prefs) => void
  /** Offered only when given: a "reset the quests" row, behind a confirmation.
   *  Called once, after the player has confirmed. Persisting the reset (and, in
   *  a running game, restarting the walk) is the caller's. */
  onResetQuests?: () => void
}

const SLIDER_STYLE = 'width:100%'
const LABEL_STYLE = 'font-size:13px;opacity:.85;display:flex;justify-content:space-between'

/**
 * The settings menu: language, walking speed, mouse sensitivity, mushroom
 * draw distance, time of day and weather.
 *
 * Every change fires immediately (no Apply button) and is hers to persist:
 * `onPrefsChange`/`onLangChange` both get the caller's own save-and-continue.
 */
export function openSettingsMenu(prefs: Prefs, cb: SettingsCallbacks): void {
  if (document.getElementById('settings')) return
  document.exitPointerLock()

  const overlay = document.createElement('div')
  overlay.id = 'settings'
  overlay.dataset.modal = 'true'
  // `align-items:center` would clip a panel taller than the viewport with no
  // way to scroll to the clipped part (a flexbox centering/overflow gotcha —
  // `overflow-y:auto` on a centered cross-axis alone doesn't let you reach
  // content pushed above the fold). `margin:auto` on the panel itself centers
  // it when it fits and degrades to top-anchored + scrollable when it doesn't.
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130ecc;pointer-events:auto;display:flex;' +
    'justify-content:center;overflow-y:auto;font-family:system-ui,sans-serif;color:#eee'

  const panel = document.createElement('div')
  panel.style.cssText =
    'background:#171d15;border-radius:12px;padding:26px 30px;min-width:320px;max-width:90vw;' +
    'display:flex;flex-direction:column;gap:18px;margin:auto;flex-shrink:0'
  overlay.appendChild(panel)

  // Every label the menu shows in the current language — repainted whenever
  // the language changes inside the menu itself, not just on the next open.
  const labels: { el: HTMLElement; key: Parameters<typeof t>[0] }[] = []
  const label = (el: HTMLElement, key: Parameters<typeof t>[0]): void => {
    labels.push({ el, key })
    el.textContent = t(key)
  }

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:baseline;gap:14px'
  const title = document.createElement('h2')
  title.style.cssText = 'margin:0;font-size:20px'
  label(title, 'settingsTitle')
  const hint = document.createElement('span')
  hint.style.cssText = 'opacity:.5;font-size:13px;margin-left:auto'
  label(hint, 'settingsCloseHint')
  header.append(title, hint)
  panel.appendChild(header)

  const langRow = document.createElement('div')
  langRow.style.cssText = LABEL_STYLE
  const langLabel = document.createElement('span')
  label(langLabel, 'settingsLanguage')
  const langButtons = document.createElement('div')
  langButtons.style.cssText = 'display:flex;gap:8px'
  const ruBtn = document.createElement('button')
  const enBtn = document.createElement('button')
  const btnStyle = (active: boolean): string =>
    `padding:5px 12px;border-radius:6px;border:1px solid #444;cursor:pointer;font-size:13px;color:#eee;background:${active ? '#3d5a2f' : '#1a201a'}`
  const paintLang = (): void => {
    ruBtn.style.cssText = btnStyle(getLang() === 'ru')
    enBtn.style.cssText = btnStyle(getLang() === 'en')
  }
  ruBtn.textContent = 'RU'
  enBtn.textContent = 'EN'
  const repaint = (): void => {
    for (const { el, key } of labels) el.textContent = t(key)
  }
  ruBtn.addEventListener('click', () => {
    setLang('ru')
    cb.onLangChange('ru')
    paintLang()
    repaint()
  })
  enBtn.addEventListener('click', () => {
    setLang('en')
    cb.onLangChange('en')
    paintLang()
    repaint()
  })
  paintLang()
  langButtons.append(ruBtn, enBtn)
  langRow.append(langLabel, langButtons)
  panel.appendChild(langRow)

  let live = { ...prefs }
  const slider = (
    key: keyof Prefs,
    labelKey:
      | 'settingsWalkSpeed'
      | 'settingsSensitivity'
      | 'settingsDrawDistance'
      | 'settingsSound'
      | 'settingsMusic'
      | 'settingsFootsteps',
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
  ): void => {
    const wrap = document.createElement('div')
    const labelRow = document.createElement('div')
    labelRow.style.cssText = LABEL_STYLE
    const labelEl = document.createElement('span')
    label(labelEl, labelKey)
    const value = document.createElement('span')
    value.style.opacity = '.7'
    labelRow.append(labelEl, value)
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(live[key])
    input.style.cssText = SLIDER_STYLE
    const paint = (): void => {
      value.textContent = format(Number(input.value))
    }
    input.addEventListener('input', () => {
      live = { ...live, [key]: Number(input.value) }
      cb.onPrefsChange(live)
      paint()
    })
    paint()
    wrap.append(labelRow, input)
    panel.appendChild(wrap)
  }

  slider('walkSpeedMultiplier', 'settingsWalkSpeed', 0.6, 1.6, 0.05, (v) => `×${v.toFixed(2)}`)
  slider('mouseSensitivity', 'settingsSensitivity', 0.3, 2.5, 0.05, (v) => `×${v.toFixed(2)}`)
  slider('drawDistance', 'settingsDrawDistance', 20, 80, 5, (v) => `${v} m`)
  slider('soundVolume', 'settingsSound', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)
  slider('musicVolume', 'settingsMusic', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)
  slider('footstepVolume', 'settingsFootsteps', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)

  const timeRow = document.createElement('div')
  timeRow.style.cssText = LABEL_STYLE
  const timeLabel = document.createElement('span')
  label(timeLabel, 'settingsTimeMode')
  const timeButtons = document.createElement('div')
  timeButtons.style.cssText = 'display:flex;gap:8px'
  const timeBtns = new Map<TimeMode, HTMLButtonElement>()
  const paintTime = (): void => {
    for (const [mode, btn] of timeBtns) btn.style.cssText = btnStyle(mode === live.timeMode)
  }
  for (const mode of TIME_MODES) {
    const btn = document.createElement('button')
    label(btn, TIME_MODE_KEY[mode])
    btn.addEventListener('click', () => {
      live = { ...live, timeMode: mode }
      cb.onPrefsChange(live)
      paintTime()
    })
    timeBtns.set(mode, btn)
    timeButtons.appendChild(btn)
  }
  paintTime()
  timeRow.append(timeLabel, timeButtons)
  panel.appendChild(timeRow)

  const weatherRow = document.createElement('div')
  weatherRow.style.cssText = LABEL_STYLE
  const weatherLabel = document.createElement('span')
  label(weatherLabel, 'settingsWeather')
  const weatherButtons = document.createElement('div')
  weatherButtons.style.cssText = 'display:flex;gap:8px'
  const weatherBtns = new Map<Weather, HTMLButtonElement>()
  const paintWeather = (): void => {
    for (const [w, btn] of weatherBtns) btn.style.cssText = btnStyle(w === live.weather)
  }
  for (const w of WEATHERS) {
    const btn = document.createElement('button')
    label(btn, WEATHER_KEY[w])
    btn.addEventListener('click', () => {
      live = { ...live, weather: w }
      cb.onPrefsChange(live)
      paintWeather()
    })
    weatherBtns.set(w, btn)
    weatherButtons.appendChild(btn)
  }
  paintWeather()
  weatherRow.append(weatherLabel, weatherButtons)
  panel.appendChild(weatherRow)

  // A generic on/off row for one boolean Prefs field — the same "one function
  // builds every row of this kind" idea as `slider()` above, extracted once
  // a second toggle (invert-Y, below) needed the exact same wiring the
  // minimap toggle already had.
  const toggle = (
    key: 'minimap' | 'minimapQuestHints' | 'invertMouseY' | 'groundTracks',
    labelKey: 'settingsMinimap' | 'settingsMinimapHints' | 'settingsInvertY' | 'settingsTracks',
  ): void => {
    const row = document.createElement('div')
    row.style.cssText = LABEL_STYLE
    const labelEl = document.createElement('span')
    label(labelEl, labelKey)
    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;gap:8px'
    const onBtn = document.createElement('button')
    const offBtn = document.createElement('button')
    const paint = (): void => {
      onBtn.style.cssText = btnStyle(live[key])
      offBtn.style.cssText = btnStyle(!live[key])
    }
    label(onBtn, 'settingsOn')
    label(offBtn, 'settingsOff')
    onBtn.addEventListener('click', () => {
      live = { ...live, [key]: true }
      cb.onPrefsChange(live)
      paint()
    })
    offBtn.addEventListener('click', () => {
      live = { ...live, [key]: false }
      cb.onPrefsChange(live)
      paint()
    })
    paint()
    buttons.append(onBtn, offBtn)
    row.append(labelEl, buttons)
    panel.appendChild(row)
  }

  // Off by default (see ui/compass.ts) — a map that shows where you are
  // kills half the point of a walk in the woods. This is the one place a
  // player can opt into it.
  toggle('minimap', 'settingsMinimap')
  // Off by default, independent of the minimap toggle above — see the
  // 2026-09-15 addendum: showing the map at all and showing where the
  // hidden quest items are is two separate choices.
  toggle('minimapQuestHints', 'settingsMinimapHints')
  // Off by default — most players read "mouse up" as "look up".
  toggle('invertMouseY', 'settingsInvertY')
  // On by default — fading footprints/tyre tracks/animal tracks read as part
  // of an ordinary walk in the woods, not a spoiler like the quest hints
  // above; a player opts out rather than in. See world/tracks.ts.
  toggle('groundTracks', 'settingsTracks')

  // Destructive, so never one click: "Reset…" swaps for a question and a pair
  // of buttons, and a Cancel puts it back exactly as it was.
  if (cb.onResetQuests) {
    const onResetQuests = cb.onResetQuests
    const row = document.createElement('div')
    row.id = 'settings-quests'
    row.style.cssText = 'display:flex;flex-direction:column;gap:10px'
    const head = document.createElement('div')
    head.style.cssText = LABEL_STYLE
    const headLabel = document.createElement('span')
    label(headLabel, 'settingsQuests')
    const resetBtn = document.createElement('button')
    resetBtn.id = 'settings-quests-reset'
    label(resetBtn, 'settingsQuestsReset')
    resetBtn.style.cssText = btnStyle(false)
    head.append(headLabel, resetBtn)

    const confirmBox = document.createElement('div')
    confirmBox.id = 'settings-quests-confirm'
    confirmBox.style.cssText = 'display:none;flex-direction:column;gap:10px'
    const question = document.createElement('p')
    question.style.cssText = 'margin:0;font-size:13px;line-height:1.45;max-width:340px'
    label(question, 'settingsQuestsConfirm')
    const answers = document.createElement('div')
    answers.style.cssText = 'display:flex;gap:8px'
    const yesBtn = document.createElement('button')
    yesBtn.id = 'settings-quests-yes'
    label(yesBtn, 'settingsQuestsYes')
    yesBtn.style.cssText = btnStyle(true)
    const noBtn = document.createElement('button')
    noBtn.id = 'settings-quests-no'
    label(noBtn, 'settingsQuestsNo')
    noBtn.style.cssText = btnStyle(false)
    answers.append(yesBtn, noBtn)
    confirmBox.append(question, answers)

    const done = document.createElement('p')
    done.id = 'settings-quests-done'
    done.style.cssText = 'display:none;margin:0;font-size:13px;color:#7ec46b'
    label(done, 'settingsQuestsDone')

    resetBtn.addEventListener('click', () => {
      resetBtn.style.display = 'none'
      confirmBox.style.display = 'flex'
    })
    noBtn.addEventListener('click', () => {
      confirmBox.style.display = 'none'
      resetBtn.style.display = ''
    })
    yesBtn.addEventListener('click', () => {
      confirmBox.style.display = 'none'
      done.style.display = 'block'
      onResetQuests()
    })
    row.append(head, confirmBox, done)
    panel.appendChild(row)
  }

  document.getElementById('ui')!.appendChild(overlay)

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'KeyM' && e.code !== 'Escape') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}
