import { t, getLang } from '../i18n/i18n'
import { POPULAR_PLACES } from './popularPlaces'

/**
 * The place-picker screen: name a real wood, or walk into the baked demo one.
 *
 * OpenStreetMap and AWS Terrain Tiles attribution sits here, visible before the
 * player ever presses a key — their licences require it, and it should not be
 * something to go hunting for in an "about" screen nobody opens. Attribution
 * text itself stays in English regardless of interface language, matching how
 * most software credits its data sources.
 */
export function openPlacePicker(onPick: (query: string | null) => void): void {
  const overlay = document.createElement('div')
  overlay.id = 'place-picker'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130e;pointer-events:auto;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee;gap:18px;padding:24px'

  overlay.innerHTML = `
    <h1 style="margin:0;font-size:28px">itffm</h1>
    <p style="margin:0;opacity:.75;max-width:420px;text-align:center;line-height:1.5">${t('placeIntro')}</p>
    <input id="place-input" type="text" placeholder="${t('placePlaceholder')}"
      style="width:min(420px,90vw);padding:11px 14px;font-size:16px;border-radius:8px;border:1px solid #444;background:#1a201a;color:#eee" />
    <div style="display:flex;gap:12px;margin-top:4px">
      <button id="place-go" style="padding:11px 22px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-weight:600;font-size:15px;cursor:pointer">${t('placeGo')}</button>
      <button id="place-demo" style="padding:11px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:15px;cursor:pointer">${t('placeDemo')}</button>
    </div>
    <p style="margin:8px 0 0;opacity:.6;font-size:13px">${t('placePopular')}</p>
    <div id="place-popular" style="display:flex;flex-wrap:wrap;gap:8px;max-width:520px;justify-content:center"></div>
    <p style="position:fixed;bottom:10px;opacity:.4;font-size:11px;text-align:center;max-width:600px">
      Terrain © <a href="https://registry.opendata.aws/terrain-tiles/" style="color:inherit">AWS Terrain Tiles</a>.
      Map data © <a href="https://www.openstreetmap.org/copyright" style="color:inherit">OpenStreetMap</a> contributors, ODbL.
    </p>`

  document.getElementById('ui')!.appendChild(overlay)

  const input = overlay.querySelector<HTMLInputElement>('#place-input')!
  const go = () => {
    const q = input.value.trim()
    overlay.remove()
    onPick(q.length > 0 ? q : null)
  }

  overlay.querySelector('#place-go')!.addEventListener('click', go)
  input.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') go()
  })
  overlay.querySelector('#place-demo')!.addEventListener('click', () => {
    overlay.remove()
    onPick(null)
  })

  const popular = overlay.querySelector<HTMLDivElement>('#place-popular')!
  for (const place of POPULAR_PLACES) {
    const button = document.createElement('button')
    button.textContent = getLang() === 'ru' ? place.ru : place.en
    button.style.cssText =
      'padding:7px 14px;border:1px solid #444;border-radius:16px;background:#1a201a;color:#ccc;font-size:13px;cursor:pointer'
    button.addEventListener('click', () => {
      overlay.remove()
      onPick(place.query)
    })
    popular.appendChild(button)
  }
}

/** A loading screen with a stage message that can be updated as we go. */
export function showLoading(message: string): { update(m: string): void; close(): void } {
  const overlay = document.createElement('div')
  overlay.id = 'loading'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130e;pointer-events:auto;display:flex;' +
    'align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#eee'
  const text = document.createElement('p')
  text.style.cssText = 'opacity:.8;font-size:15px'
  text.textContent = message
  overlay.appendChild(text)
  document.getElementById('ui')!.appendChild(overlay)

  return {
    update(m: string) {
      text.textContent = m
    },
    close() {
      overlay.remove()
    },
  }
}
