import { t, getLang, setLang, type Lang } from '../i18n/i18n'
import type { Prefs } from '../save/store'

export interface SettingsCallbacks {
  onLangChange: (lang: Lang) => void
  onPrefsChange: (prefs: Prefs) => void
}

const SLIDER_STYLE = 'width:100%'
const LABEL_STYLE = 'font-size:13px;opacity:.85;display:flex;justify-content:space-between'

/**
 * The settings menu: language, walking speed, mouse sensitivity, mushroom
 * draw distance — the handful the design calls out as first (see TODO.md).
 * Time of day and weather are not here yet because neither system exists —
 * a slider with nothing to drive would be worse than no slider.
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
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130ecc;pointer-events:auto;display:flex;' +
    'align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee'

  const panel = document.createElement('div')
  panel.style.cssText =
    'background:#171d15;border-radius:12px;padding:26px 30px;min-width:320px;max-width:90vw;display:flex;flex-direction:column;gap:18px'
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
    labelKey: 'settingsWalkSpeed' | 'settingsSensitivity' | 'settingsDrawDistance',
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

  document.getElementById('ui')!.appendChild(overlay)

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'KeyM' && e.code !== 'Escape') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}
