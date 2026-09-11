import type { Weather } from '../world/weather'

/**
 * How strong the wind bed reads, by weather and time of day — the forest
 * background TODO.md asked for ("меняется от погоды и времени суток, а не
 * крутится одной петлёй"), not a single fixed loop. Rain and snow read as
 * the windiest (a storm moves air), fog as the stillest (damp, heavy air
 * rarely gusts); night gets a modest boost across the board — the visual
 * scene is starker after dark, so the same wind reads as more present.
 */
const WEATHER_BASE_GAIN: Record<Weather, number> = {
  clear: 0.12,
  fog: 0.06,
  rain: 0.28,
  snow: 0.22,
}

/** How much louder the wind reads at full night versus full day — a
 *  gentle lift, not a second weather system of its own. */
const NIGHT_BOOST = 0.3

/**
 * The wind bed's own target gain, [0, 1] — `night` is the same value
 * `world/daynight.ts`'s `nightFactor` already drives the sky/shelter/music
 * crossfade with, not a separate notion of "night."
 */
export function windGain(weather: Weather, night: number): number {
  return WEATHER_BASE_GAIN[weather] * (1 + Math.max(0, Math.min(1, night)) * NIGHT_BOOST)
}
