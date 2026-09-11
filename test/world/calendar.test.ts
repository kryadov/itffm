import { gameDaysElapsed, gameMonth, isRainDay, daysSinceRain, REAL_HOURS_PER_GAME_DAY } from '../../src/world/calendar'

describe('gameDaysElapsed', () => {
  it('is zero at the start', () => {
    expect(gameDaysElapsed(1000, 1000)).toBe(0)
  })

  it('gives one game day per REAL_HOURS_PER_GAME_DAY real hours', () => {
    const hourMs = REAL_HOURS_PER_GAME_DAY * 60 * 60 * 1000
    expect(gameDaysElapsed(0, hourMs)).toBeCloseTo(1, 5)
    expect(gameDaysElapsed(0, hourMs * 2.5)).toBeCloseTo(2.5, 5)
  })

  it('never goes negative, even if the clock skewed backward', () => {
    expect(gameDaysElapsed(10_000, 0)).toBe(0)
  })
})

describe('gameMonth', () => {
  it('starts at month 1', () => {
    expect(gameMonth(0)).toBe(1)
    expect(gameMonth(29)).toBe(1)
  })

  it('advances a month every 30 game-days', () => {
    expect(gameMonth(30)).toBe(2)
    expect(gameMonth(60)).toBe(3)
  })

  it('wraps back to month 1 after a 360-day year', () => {
    expect(gameMonth(360)).toBe(1)
    expect(gameMonth(360 + 30)).toBe(2)
  })

  it('always returns a value in 1..12', () => {
    for (let d = 0; d < 720; d += 7) {
      const m = gameMonth(d)
      expect(m).toBeGreaterThanOrEqual(1)
      expect(m).toBeLessThanOrEqual(12)
    }
  })
})

describe('isRainDay', () => {
  it('is deterministic for one (seed, day)', () => {
    expect(isRainDay(7, 40)).toBe(isRainDay(7, 40))
  })

  it('varies across days for the same seed — not every day is the same', () => {
    const days = Array.from({ length: 60 }, (_, i) => isRainDay(3, i))
    expect(days.some((d) => d)).toBe(true)
    expect(days.some((d) => !d)).toBe(true)
  })

  it('gives a different rain history for a different seed', () => {
    const a = Array.from({ length: 30 }, (_, i) => isRainDay(1, i))
    const b = Array.from({ length: 30 }, (_, i) => isRainDay(2, i))
    expect(a).not.toEqual(b)
  })
})

describe('daysSinceRain', () => {
  it('never goes negative', () => {
    for (let d = 0; d < 100; d += 3) {
      expect(daysSinceRain(11, d)).toBeGreaterThanOrEqual(0)
    }
  })

  it('never exceeds the drought cap', () => {
    for (let d = 0; d < 200; d += 5) {
      expect(daysSinceRain(11, d)).toBeLessThanOrEqual(14)
    }
  })

  it('is small right after a known rain day', () => {
    // Find a seed/day where it actually rained, then check the very next
    // fractional moment reads as "just rained," not still in drought.
    let rainDay = -1
    for (let d = 0; d < 200; d++) {
      if (isRainDay(5, d)) {
        rainDay = d
        break
      }
    }
    expect(rainDay).toBeGreaterThanOrEqual(0)
    expect(daysSinceRain(5, rainDay + 0.1)).toBeCloseTo(0.1, 5)
  })
})
