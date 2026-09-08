import { t } from '../i18n/i18n'

declare const __APP_VERSION__: string

/**
 * Crosshair, prompt, basket counter and the settings gear.
 *
 * Plain DOM over the canvas rather than text in the scene: we need species
 * names in two languages at small sizes, and 3D text reads badly at both.
 */
export function createHud(
  root: HTMLElement,
  onSettings: () => void,
): {
  setTarget(name: string | null): void
  setBasket(n: number, cap: number): void
} {
  root.insertAdjacentHTML(
    'beforeend',
    `<div id="crosshair" style="position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;opacity:.55"></div>
     <div id="hint" style="position:fixed;left:50%;top:calc(50% + 26px);transform:translateX(-50%);font-size:15px;white-space:nowrap;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .12s"></div>
     <div id="basket" style="position:fixed;right:16px;bottom:14px;font-size:14px;text-shadow:0 1px 3px #000;opacity:.85"></div>
     <div id="version" style="position:fixed;left:8px;bottom:2px;font-size:10px;text-shadow:0 1px 2px #000;opacity:.35;pointer-events:none">v${__APP_VERSION__}</div>
     <button id="settings-btn" title="${t('settingsTitle')} — M" aria-label="${t('settingsTitle')}"
       style="position:fixed;top:14px;right:16px;width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(15,19,14,.55);color:#eee;font-size:15px;line-height:1;cursor:pointer;pointer-events:auto">⚙</button>`,
  )
  const hint = root.querySelector<HTMLElement>('#hint')!
  const basket = root.querySelector<HTMLElement>('#basket')!
  root.querySelector<HTMLButtonElement>('#settings-btn')!.addEventListener('click', onSettings)

  return {
    setTarget(name) {
      if (name) hint.textContent = `${name} — E`
      hint.style.opacity = name ? '1' : '0'
    },
    setBasket(n, cap) {
      basket.textContent = `🧺 ${n} / ${cap}`
    },
  }
}
