import { yieldToPaint } from '../../src/util/yield'

describe('yieldToPaint', () => {
  it('resolves outside a browser, where there is no requestAnimationFrame', async () => {
    await expect(yieldToPaint()).resolves.toBeUndefined()
  })

  it('still resolves when requestAnimationFrame never fires (a background tab)', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    try {
      await expect(yieldToPaint()).resolves.toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('waits for a frame when the browser provides one', async () => {
    let fired = false
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      setTimeout(() => {
        fired = true
        cb()
      }, 10)
      return 1
    })
    try {
      await yieldToPaint()
      expect(fired).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
