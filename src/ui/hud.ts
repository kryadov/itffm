/**
 * Crosshair, prompt and basket counter.
 *
 * Plain DOM over the canvas rather than text in the scene: we need species
 * names in two languages at small sizes, and 3D text reads badly at both.
 */
export function createHud(root: HTMLElement): {
  setTarget(name: string | null): void
  setBasket(n: number, cap: number): void
} {
  root.insertAdjacentHTML(
    'beforeend',
    `<div id="crosshair" style="position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;opacity:.55"></div>
     <div id="hint" style="position:fixed;left:50%;top:calc(50% + 26px);transform:translateX(-50%);font-size:15px;white-space:nowrap;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .12s"></div>
     <div id="basket" style="position:fixed;right:16px;bottom:14px;font-size:14px;text-shadow:0 1px 3px #000;opacity:.85"></div>`,
  )
  const hint = root.querySelector<HTMLElement>('#hint')!
  const basket = root.querySelector<HTMLElement>('#basket')!

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
