/**
 * Hands the main thread back to the browser long enough to paint a frame,
 * then resolves. A loading screen only animates if something between two
 * chunks of heavy synchronous work lets it (a `THREE` spinner's own
 * `setAnimationLoop` is a rAF callback; a blocked thread never gets to run it).
 *
 * `requestAnimationFrame` alone would stall the whole load in a background
 * tab, where it never fires — hence the timer racing it. Outside a browser
 * (tests) there is no rAF and this is just a macrotask turn.
 */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      resolve()
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(finish, 0))
      setTimeout(finish, 100)
    } else {
      setTimeout(finish, 0)
    }
  })
}
