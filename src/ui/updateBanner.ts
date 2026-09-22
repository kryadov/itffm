import { t } from '../i18n/i18n'

/**
 * The "a new version is here" banner — shown once a freshly-installed
 * service worker has actually taken over the page (see `main.ts`'s
 * `controllerchange` wiring), never eagerly: `public/sw.js` calls
 * `skipWaiting()`/`clients.claim()`, so a new release can finish installing
 * itself in the background at any moment, including mid-play, and reloading
 * right then would drop whatever the player is doing. It sits at the bottom
 * of the screen until the player acts on it or dismisses it — unlike
 * `main.ts`'s own `toast()`, it never times out on its own, since missing it
 * only means playing on an older build a while longer, not missing a
 * one-off event message.
 */
export function createUpdateBanner(onUpdate: () => void): { show(): void } {
  let shown = false
  return {
    show() {
      if (shown) return // one at a time — a second update landing while this
      shown = true // one's still up would otherwise stack a duplicate banner.
      const el = document.createElement('div')
      el.id = 'update-banner'
      el.style.cssText =
        'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;' +
        'background:#2a1f14;border:1px solid #d8a04a;border-radius:8px;padding:10px 12px;' +
        'display:flex;align-items:center;gap:10px;font-size:13px;color:#eee;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.4)'
      const label = document.createElement('span')
      label.textContent = t('updateAvailable')
      const updateBtn = document.createElement('button')
      updateBtn.textContent = t('updateNow')
      updateBtn.style.cssText =
        'padding:5px 12px;border-radius:6px;border:1px solid #d8a04a;cursor:pointer;' +
        'font-size:13px;color:#eee;background:#3d5a2f'
      updateBtn.onclick = () => onUpdate()
      const dismissBtn = document.createElement('button')
      dismissBtn.textContent = t('updateDismiss')
      dismissBtn.style.cssText =
        'padding:5px 10px;border-radius:6px;border:1px solid #444;cursor:pointer;' +
        'font-size:13px;color:#ccc;background:#1a201a'
      dismissBtn.onclick = () => el.remove()
      el.append(label, updateBtn, dismissBtn)
      document.body.appendChild(el)
    },
  }
}
