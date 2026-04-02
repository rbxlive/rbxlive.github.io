/**
 * alpha-stops.js — Alpha Stops reconstruction
 *
 * Documented behavior (Trading Alpha Alpha Vault):
 *
 *   Designed exclusively for Stage 2 uptrends (and equivalent Stage 2
 *   downtrends for shorts). Goal: capture ~95% of every Stage 2 move
 *   without getting stopped out during normal corrections.
 *
 *   "Set it, forget it, let the trade prove itself."
 *   Rotates capital out of lagging positions; never babysits.
 *
 * TWO MODES (confirmed from docs):
 *   Low-Risk  — Tighter stop, hugs price, smaller drawdowns, faster exits.
 *               Best for traders who want minimal heat on the position.
 *   High-Risk — Wider stop, more breathing room for volatile Stage 2 moves.
 *               Best for capturing full multi-month/year trends.
 *               (This is "Long High 11" from the chart label — "High" = High-Risk)
 *
 * DIRECTION (user-selected at trade entry, not auto-detected):
 *   'long'  — Stop trails BELOW price (default per docs)
 *   'short' — Stop trails ABOVE price
 *
 * CONFIRMED PARAMETERS (from chart label "Alpha Stops Long High 11"):
 *   period     = 11   — ATR period
 *   High-Risk multiplier ≈ 3.0  (held BTC through every 20-30% correction 2023-2025)
 *   Low-Risk  multiplier ≈ 1.5  (tighter, ~half the distance)
 *
 * VISUAL:
 *   Plots as dots directly on the price chart (not a separate pane).
 *   Long stop: green dots trailing below price.
 *   Short stop: red dots trailing above price.
 *   Label shows current stop price (e.g. "LONG STOP 141.61").
 *
 * USAGE:
 *   Call once when entering a trade. Pass the candles from entry bar onward.
 *   The stop only moves in the direction of the trade — never against it.
 *   When price closes beyond the stop, the trade is done. Re-enter fresh
 *   on the next Stage 2 breakout with a new stop.
 *
 * Parameters:
 *   direction  {'long'|'short'} 'long'  — Trade direction (set at entry)
 *   risk       {'low'|'high'}   'high'  — Risk tolerance mode
 *   period     {number}         11      — ATR period (confirmed)
 *   lowMult    {number}         1.5     — Multiplier for Low-Risk mode
 *   highMult   {number}         3.0     — Multiplier for High-Risk mode
 */

import { atr, fields } from './utils.js';

export function alphaStops(candles, options = {}) {
  const {
    direction = 'long',
    risk      = 'high',
    period    = 11,
    lowMult   = 1.5,
    highMult  = 3.0,
  } = options;

  const multiplier = risk === 'high' ? highMult : lowMult;
  const isLong = direction === 'long';

  const { highs, lows, closes, times } = fields(candles);
  const n = closes.length;

  const atrVals = atr(highs, lows, closes, period);

  // ── Trailing stop ──────────────────────────────────────────────────────────
  // For longs:  stop = close − (ATR × multiplier), never moves down
  // For shorts: stop = close + (ATR × multiplier), never moves up
  // The stop only moves in the direction of the trade — corrections don't
  // pull it back, which is what allows it to hold through Stage 2 volatility.

  const stop     = new Array(n).fill(NaN);
  const stopped  = new Array(n).fill(false); // true on the bar price closes through stop

  for (let i = 0; i < n; i++) {
    if (isNaN(atrVals[i])) continue;

    const dist     = multiplier * atrVals[i];
    const newLevel = isLong
      ? closes[i] - dist   // long stop: below close
      : closes[i] + dist;  // short stop: above close

    if (i === 0 || isNaN(stop[i - 1])) {
      stop[i] = newLevel;
    } else if (isLong) {
      // Long: stop only moves UP (never retreats down on dips)
      stop[i] = Math.max(newLevel, stop[i - 1]);
    } else {
      // Short: stop only moves DOWN (never retreats up on bounces)
      stop[i] = Math.min(newLevel, stop[i - 1]);
    }

    // Detect stop-out: price closed through the stop
    if (i > 0) {
      if (isLong  && closes[i] < stop[i]) stopped[i] = true;
      if (!isLong && closes[i] > stop[i]) stopped[i] = true;
    }
  }

  // ── Current stop level (last valid value) ──────────────────────────────────
  const currentStop = [...stop].reverse().find((v) => !isNaN(v)) ?? NaN;

  // ── Distance from current price to stop (as % and ATR multiples) ───────────
  const distanceInfo = stop.map((s, i) => {
    if (isNaN(s) || isNaN(closes[i]) || isNaN(atrVals[i])) return null;
    const priceDiff = isLong ? closes[i] - s : s - closes[i];
    return {
      dollars:  priceDiff,
      pct:      (priceDiff / closes[i]) * 100,
      atrMults: priceDiff / atrVals[i],
    };
  });

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:         times[i],
    stop:         stop[i],          // The stop level — plot as dots on price chart
    direction:    direction,         // 'long' | 'short'
    risk:         risk,              // 'low' | 'high'
    color:        isLong ? 'green' : 'red',
    stopped:      stopped[i],        // true = price closed through stop, exit here
    distance:     distanceInfo[i],   // { dollars, pct, atrMults } from current price
    atr:          atrVals[i],
    currentStop,                     // Convenience: latest stop level
  }));
}

/**
 * Convenience wrapper — returns just the current stop level for a position.
 * Usage: const stopLevel = getStopLevel(candles, { direction: 'long', risk: 'high' });
 */
export function getStopLevel(candles, options = {}) {
  const results = alphaStops(candles, options);
  const last = results[results.length - 1];
  return {
    stop:      last?.stop      ?? NaN,
    stopped:   last?.stopped   ?? false,
    distance:  last?.distance  ?? null,
    direction: options.direction ?? 'long',
    risk:      options.risk      ?? 'high',
  };
}
