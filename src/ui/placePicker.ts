const EXAMPLES = ['Лосиный Остров', 'Куршская коса', '55.87, 37.77']

/**
 * The place-picker screen: name a real wood, or walk into the baked demo one.
 *
 * OpenStreetMap and AWS Terrain Tiles attribution sits here, visible before the
 * player ever presses a key — their licences require it, and it should not be
 * something to go hunting for in an "about" screen nobody opens.
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
    <p style="margin:0;opacity:.75;max-width:420px;text-align:center;line-height:1.5">
      Name a real wood — your own local one, a nature reserve, a national park —
      and the ground, the trees and the mushrooms will follow its actual ecology.
    </p>
    <input id="place-input" type="text" placeholder="${EXAMPLES[0]}"
      style="width:min(420px,90vw);padding:11px 14px;font-size:16px;border-radius:8px;border:1px solid #444;background:#1a201a;color:#eee" />
    <div style="opacity:.5;font-size:13px">${EXAMPLES.map((e) => `“${e}”`).join(' · ')}</div>
    <div style="display:flex;gap:12px;margin-top:4px">
      <button id="place-go" style="padding:11px 22px;border:0;border-radius:8px;background:#7ec46b;color:#12160f;font-weight:600;font-size:15px;cursor:pointer">Into the wood</button>
      <button id="place-demo" style="padding:11px 22px;border:1px solid #555;border-radius:8px;background:transparent;color:#ddd;font-size:15px;cursor:pointer">Just show me a wood</button>
    </div>
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
