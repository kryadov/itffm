import { t } from '../i18n/i18n'
import { cornerRight, CORNER_SIZE } from './cornerButtons'

declare const __APP_VERSION__: string

/** A touch player has no `Tab`/`Q` to reach for — see game/touchControls.ts's
 *  own doc comment for why touch gets a different control scheme rather than
 *  a virtual keyboard. */
export interface TouchButtons {
  active: boolean
  onEncyclopedia: () => void
  onTally: () => void
}

function cornerButton(id: string, slot: number, title: string, glyph: string): string {
  return (
    `<button id="${id}" title="${title}" aria-label="${title}" hidden` +
    ` style="position:fixed;top:14px;right:${cornerRight(slot)}px;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px;` +
    'border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(15,19,14,.55);' +
    'color:#eee;font-size:15px;line-height:1;cursor:pointer;pointer-events:auto">' +
    `${glyph}</button>`
  )
}

/**
 * Crosshair, prompt, basket counter and the gear that opens the pause menu
 * (`main.ts`'s `openPauseMenu()` — the same one `Esc` opens, so a touch
 * player with no physical Escape key still reaches it) — plus, on touch,
 * the encyclopedia and tally buttons a mouse-and-keyboard player reaches with
 * `Tab`/`Q` instead (`ui/cornerButtons.ts` packs them against the gear so
 * adding one never needs its own hand-picked offset).
 *
 * Plain DOM over the canvas rather than text in the scene: we need species
 * names in two languages at small sizes, and 3D text reads badly at both.
 */
export function createHud(
  root: HTMLElement,
  onSettings: () => void,
  touch: TouchButtons,
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
     <div id="help-hint" style="position:fixed;left:8px;top:14px;font-size:11px;text-shadow:0 1px 3px #000;opacity:.4;pointer-events:none">${t('helpHint')}</div>
     <button id="settings-btn" title="${t('pauseTitle')} — Esc" aria-label="${t('pauseTitle')}"
       style="position:fixed;top:14px;right:16px;width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(15,19,14,.55);color:#eee;font-size:15px;line-height:1;cursor:pointer;pointer-events:auto">⚙</button>
     ${cornerButton('encyclopedia-btn', 1, t('encyclopedia'), '📖')}
     ${cornerButton('tally-btn', 2, t('tally'), '🧺')}`,
  )
  const hint = root.querySelector<HTMLElement>('#hint')!
  const basket = root.querySelector<HTMLElement>('#basket')!
  root.querySelector<HTMLButtonElement>('#settings-btn')!.addEventListener('click', onSettings)

  const encyclopediaBtn = root.querySelector<HTMLButtonElement>('#encyclopedia-btn')!
  const tallyBtn = root.querySelector<HTMLButtonElement>('#tally-btn')!
  if (touch.active) {
    encyclopediaBtn.hidden = false
    tallyBtn.hidden = false
  }
  encyclopediaBtn.addEventListener('click', touch.onEncyclopedia)
  tallyBtn.addEventListener('click', touch.onTally)

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
