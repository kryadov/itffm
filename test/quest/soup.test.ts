import { soupAtFire, soupAtHut, tickSoup, readSoup, NO_SOUP, COOK_SECONDS } from '../../src/quest/soup'

describe('the fish-soup quest', () => {
  it('needs a fish to start', () => {
    expect(soupAtFire(NO_SOUP, false)).toEqual({ soup: NO_SOUP, event: 'needFish' })
  })

  it('goes fire → simmer → ready → carried → on the table', () => {
    let { soup, event } = soupAtFire(NO_SOUP, true)
    expect(event).toBe('started')
    expect(soup.stage).toBe('cooking')
    expect(soupAtFire(soup, true).event).toBe('stillCooking')
    soup = tickSoup(soup, COOK_SECONDS / 2)
    expect(soup.stage).toBe('cooking')
    soup = tickSoup(soup, COOK_SECONDS / 2 + 0.01)
    expect(soup.stage).toBe('ready')
    ;({ soup, event } = soupAtFire(soup, false))
    expect(event).toBe('took')
    expect(soup.stage).toBe('carrying')
    ;({ soup, event } = soupAtHut(soup))
    expect(event).toBe('delivered')
    expect(soup.stage).toBe('done')
  })

  it('does nothing at the hut without the soup, or at the fire once it is done', () => {
    expect(soupAtHut(NO_SOUP).event).toBeNull()
    expect(soupAtFire({ stage: 'done', left: 0 }, true).event).toBeNull()
    expect(soupAtFire({ stage: 'carrying', left: 0 }, true).event).toBeNull()
  })

  it('reads back only a real state from storage', () => {
    expect(readSoup(undefined)).toEqual(NO_SOUP)
    expect(readSoup({ stage: 'boiling' })).toEqual(NO_SOUP)
    expect(readSoup({ stage: 'cooking', left: 999 })).toEqual({ stage: 'cooking', left: COOK_SECONDS })
    expect(readSoup({ stage: 'done', left: 5 })).toEqual({ stage: 'done', left: 0 })
  })
})
