import { t } from '../i18n/i18n'
import { QUEST_MARKER_COLOR, DIAMOND_COLOR } from '../quest/colors'
import type { Quests } from '../quest/types'
import type { QuestState } from '../quest/state'

const ITEM_ORDER = ['axe', 'lamp', 'rod', 'bike', 'diamond'] as const

const ITEM_NAME_KEY = {
  axe: 'questItemNameAxe',
  lamp: 'questItemNameLamp',
  rod: 'questItemNameRod',
  bike: 'questItemNameBike',
  diamond: 'questItemNameDiamond',
} as const

/** What each item does — and, for the rod and the bicycle, where it waits
 *  and how to take it again. Its own text, not the delivery toast's: a toast
 *  says what just happened ("left in the hut"), this says what it is for. */
const ITEM_ABILITY_KEY = {
  axe: 'questAbilityAxe',
  lamp: 'questAbilityLamp',
  rod: 'questAbilityRod',
  bike: 'questAbilityBike',
  diamond: 'questAbilityDiamond',
} as const

const STATE_KEY: Record<QuestState, 'questStatePending' | 'questStateCarrying' | 'questStateDone'> = {
  pending: 'questStatePending',
  carrying: 'questStateCarrying',
  done: 'questStateDone',
}

const ITEM_COLOR: Record<(typeof ITEM_ORDER)[number], string> = { ...QUEST_MARKER_COLOR, diamond: DIAMOND_COLOR }

/** The pause menu's "Rules & Quests" screen: how the basket/encyclopedia
 *  loop works, and a read-only list of the five quest items with what each
 *  unlocks and its current state — pulled straight from the live `quests`
 *  record, no new save shape (see the 2026-09-15 addendum). */
export function openQuestGuide(quests: Quests): void {
  if (document.getElementById('questGuide')) return
  document.exitPointerLock()

  const overlay = document.createElement('div')
  overlay.id = 'questGuide'
  overlay.dataset.modal = 'true'
  overlay.style.cssText =
    'position:fixed;inset:0;background:#0f130ecc;pointer-events:auto;display:flex;' +
    'justify-content:center;overflow-y:auto;font-family:system-ui,sans-serif;color:#eee'

  const panel = document.createElement('div')
  panel.style.cssText =
    'background:#171d15;border-radius:12px;padding:26px 30px;min-width:320px;max-width:480px;' +
    'display:flex;flex-direction:column;gap:16px;margin:auto;flex-shrink:0'
  overlay.appendChild(panel)

  const title = document.createElement('h2')
  title.style.cssText = 'margin:0;font-size:20px'
  title.textContent = t('questGuideTitle')
  panel.appendChild(title)

  const intro = document.createElement('p')
  intro.style.cssText = 'margin:0;line-height:1.6;font-size:14px;opacity:.9'
  intro.textContent = t('questGuideIntro')
  panel.appendChild(intro)

  const list = document.createElement('div')
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px'
  for (const id of ITEM_ORDER) {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:baseline;gap:10px'

    const dot = document.createElement('span')
    dot.style.cssText =
      `width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${ITEM_COLOR[id]};` +
      'box-shadow:0 0 0 1.5px rgba(0,0,0,.6)'
    row.appendChild(dot)

    const text = document.createElement('div')
    text.style.cssText = 'display:flex;flex-direction:column;gap:2px'
    const name = document.createElement('div')
    name.style.cssText = 'font-size:14px;display:flex;gap:8px;align-items:baseline'
    const nameLabel = document.createElement('span')
    nameLabel.textContent = t(ITEM_NAME_KEY[id])
    const state = document.createElement('span')
    state.style.cssText = 'opacity:.6;font-size:12px'
    state.textContent = `— ${t(STATE_KEY[quests[id].state])}`
    name.append(nameLabel, state)
    const ability = document.createElement('div')
    ability.style.cssText = 'font-size:13px;opacity:.75;line-height:1.4'
    ability.textContent = t(ITEM_ABILITY_KEY[id])
    text.append(name, ability)
    row.appendChild(text)
    list.appendChild(row)
  }
  panel.appendChild(list)

  document.getElementById('ui')!.appendChild(overlay)

  const close = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return
    e.preventDefault()
    overlay.remove()
    removeEventListener('keydown', close)
  }
  addEventListener('keydown', close)
}
