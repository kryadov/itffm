import {
  honeyAtShelf, honeyOnLaunch, honeyInFlight, honeyOnLand, jarInHand, jarOnDrone, readHoney,
  NO_HONEY, FILL_SECONDS, HIVE_REACH,
} from '../../src/quest/honey'

describe('the honey quest', () => {
  it('goes shelf → hand → under the quadcopter → filled by the hive → hand → shelf', () => {
    let r = honeyAtShelf(NO_HONEY, true)
    expect(r.event).toBe('tookJar')
    expect(jarInHand(r.honey)).toBe('empty')
    r = honeyOnLaunch(r.honey)
    expect(r.event).toBe('launched')
    expect(jarOnDrone(r.honey)).toBe('empty')
    expect(jarInHand(r.honey)).toBeNull()
    r = honeyInFlight(r.honey, 20, 1)
    expect(r.event).toBeNull()
    r = honeyInFlight(r.honey, HIVE_REACH - 0.5, 0.5)
    expect(r.event).toBe('byHive')
    r = honeyInFlight(r.honey, HIVE_REACH - 0.5, FILL_SECONDS)
    expect(r.event).toBe('filled')
    expect(jarOnDrone(r.honey)).toBe('full')
    r = honeyOnLand(r.honey)
    expect(r.event).toBe('backFull')
    expect(jarInHand(r.honey)).toBe('full')
    r = honeyAtShelf(r.honey, true)
    expect(r.event).toBe('delivered')
    expect(r.honey.stage).toBe('done')
  })

  it('says the quadcopter is needed when the jar is taken before there is one', () => {
    expect(honeyAtShelf(NO_HONEY, false).event).toBe('needDrone')
  })

  it('starts the count over when the quadcopter drifts away from the hive', () => {
    let r = honeyInFlight({ stage: 'drone', fill: 0 }, 1, FILL_SECONDS * 0.8)
    r = honeyInFlight(r.honey, HIVE_REACH + 1, 0.1)
    expect(r.honey.fill).toBe(0)
    r = honeyInFlight(r.honey, 1, FILL_SECONDS * 0.8)
    expect(r.honey.stage).toBe('drone')
  })

  it('brings an empty jar home as it went', () => {
    expect(honeyOnLand({ stage: 'drone', fill: 1 })).toEqual({ honey: { stage: 'jar', fill: 0 }, event: 'backEmpty' })
  })

  it('does not launch the jar when it is not in hand', () => {
    expect(honeyOnLaunch(NO_HONEY).event).toBeNull()
    expect(honeyOnLaunch({ stage: 'full', fill: 0 }).event).toBeNull()
  })

  it('reads back only a real state, and a mid-flight one as back in hand', () => {
    expect(readHoney(undefined)).toEqual(NO_HONEY)
    expect(readHoney({ stage: 'nectar' })).toEqual(NO_HONEY)
    expect(readHoney({ stage: 'drone' })).toEqual({ stage: 'jar', fill: 0 })
    expect(readHoney({ stage: 'filled' })).toEqual({ stage: 'full', fill: 0 })
    expect(readHoney({ stage: 'done' })).toEqual({ stage: 'done', fill: 0 })
  })
})
