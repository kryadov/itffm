import { t } from '../i18n/i18n'
import type { DroneReadout } from '../game/drone'

/**
 * The quadcopter's own screen, over the view from its camera: height, distance
 * from the pilot, battery and radio signal at the bottom, a warning when the
 * signal is gone or it is flying itself home, and the two keys that matter.
 * DOM over the canvas like the rest of `ui/`.
 */
export interface DroneHud {
  show(on: boolean): void
  update(r: DroneReadout, returning: boolean): void
}

const STYLE = 'font-family:system-ui,sans-serif;color:#eaf6ea;text-shadow:0 1px 3px #000'

export function createDroneHud(root: HTMLElement): DroneHud {
  const el = document.createElement('div')
  el.id = 'droneHud'
  el.style.cssText = `position:fixed;inset:0;pointer-events:none;${STYLE};display:none`
  el.innerHTML = `
    <div id="drone-frame" style="position:absolute;inset:14px;border:1px solid rgba(180,240,190,.25);border-radius:6px"></div>
    <div id="drone-cross" style="position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;
      border:1px solid rgba(180,240,190,.55);border-radius:50%"></div>
    <div id="drone-alert" style="position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:18px;
      font-weight:600;color:#ffd27a;display:none;text-align:center"></div>
    <div id="drone-bar" style="position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;gap:22px;
      align-items:baseline;font-size:15px;white-space:nowrap;background:rgba(10,16,10,.45);padding:8px 18px;border-radius:8px"></div>
    <div id="drone-keys" style="position:absolute;left:50%;bottom:66px;transform:translateX(-50%);font-size:12px;opacity:.7"></div>`
  root.appendChild(el)
  const bar = el.querySelector<HTMLElement>('#drone-bar')!
  const alert = el.querySelector<HTMLElement>('#drone-alert')!
  const keys = el.querySelector<HTMLElement>('#drone-keys')!

  return {
    show(on) {
      el.style.display = on ? 'block' : 'none'
      if (on) keys.textContent = t('droneKeys')
    },
    update(r, returning) {
      const weak = r.signalPercent < 35
      const low = r.batteryPercent <= 20
      bar.innerHTML =
        `<span>${t('droneAltitude')} <b>${Math.round(r.altitude)} ${t('droneMetres')}</b></span>` +
        `<span>${t('droneDistance')} <b>${Math.round(r.distance)} ${t('droneMetres')}</b></span>` +
        `<span style="color:${low ? '#ff8a6a' : 'inherit'}">${t('droneBattery')} <b>${r.batteryPercent}%</b></span>` +
        `<span style="color:${weak ? '#ff8a6a' : 'inherit'}">${t('droneSignal')} <b>${r.signalPercent}%</b></span>` +
        `<span>${t('droneHome')} <b style="display:inline-block;transform:rotate(${r.homeAngle}rad);color:#ffb84d">▲</b></span>`
      if (returning) {
        alert.textContent = t('droneReturning')
        alert.style.display = 'block'
      } else if (r.signalPercent <= 3) {
        alert.textContent = t('droneSignalLost')
        alert.style.display = 'block'
      } else if (low) {
        alert.textContent = t('droneBatteryLow')
        alert.style.display = 'block'
      } else {
        alert.style.display = 'none'
      }
    },
  }
}
