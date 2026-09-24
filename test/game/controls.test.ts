import { nextCrouch, CROUCH_KEYS } from '../../src/game/controls'

describe('crouch toggle', () => {
  // A live request (2026-09-24): crouching by holding Ctrl turned walking into
  // browser shortcuts (Ctrl+W closes the tab). One press crouches, the next stands.
  it('flips on each fresh press of a crouch key', () => {
    expect(nextCrouch(false, 'ControlLeft', false)).toBe(true)
    expect(nextCrouch(true, 'ControlLeft', false)).toBe(false)
    expect(nextCrouch(false, 'KeyC', false)).toBe(true)
  })

  it('ignores the browser\'s key repeat while the key is held', () => {
    expect(nextCrouch(true, 'ControlLeft', true)).toBe(true)
    expect(nextCrouch(false, 'KeyC', true)).toBe(false)
  })

  it('ignores every other key', () => {
    expect(nextCrouch(true, 'KeyW', false)).toBe(true)
    expect(nextCrouch(false, 'ShiftLeft', false)).toBe(false)
  })

  it('answers to Ctrl on either side and to C', () => {
    expect(CROUCH_KEYS).toEqual(expect.arrayContaining(['ControlLeft', 'ControlRight', 'KeyC']))
  })
})
