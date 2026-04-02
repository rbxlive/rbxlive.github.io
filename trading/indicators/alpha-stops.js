/**
 * alpha-stops.js — Alpha Stops reconstruction
 *
 * Trading Alpha's Alpha Stops is an exclusive Alpha Vault indicator.
 * Based on its name and the suite's design philosophy (dynamic, volatility-
 * aware stop placement), this is reconstructed as an ATR-based trailing stop
 * with trend-direction awareness.
 *
 * The stop:
 *   - Trails price using ATR × multiplier as the distance
 *   - Only moves in the direction of the trade — never against it
 *   - Flips direction when price closes beyond the stop level
 *   - Acts as both a stop loss and a trailing take-profit mechanism
 *
 * Additionally outputs:
 *   - initialStop: where to place your stop on trade entry
 *   - riskReward:  suggested TP levels at 1:1, 1:2, and 1:3 R:R
 *
 * Visual behavior confirmed from chart images:
 *   Plots as DOTS directly on the price chart (not a separate pane).
 *   Green dots trail BELOW price during uptrend (long stop).
 *   Red dots trail ABOVE price during downtrend (short stop).
 *   Label shows "Alpha Stops Long High [period]" — e.g. "Long High 11".
 *
 * Parameters confirmed from chart label "Alpha Stops Long High 11":
 *   period      {number} 11  — ATR period (confirmed from chart)
 *   multiplier  {number} 2.0 — ATR multiplier (distance from price)
 *                              2.0 is standard; use 1.5 for scalping,
 *                              3.0 for swing trading
 */

import { atr, fields } from './utils.js';

export function alphaStops(candles, options = {}) {
  const { period = 11, multiplier = 2.0 } = options;
  const { highs, lows, closes, times } = fields(candles);
  const n = closes.length;

  const atrVals = atr(highs, lows, closes, period);

  // ── Trailing stop ──────────────────────────────────────────────────────────
  const stop      = new Array(n).fill(NaN);
  const direction = new Array(n).fill(0); // 1 = long, -1 = short
  const flip      = new Array(n).fill(false);

  // Seed direction from first valid bar
  let seedIdx = period;
  while (seedIdx < n && isNaN(atrVals[seedIdx])) seedIdx++;
  if (seedIdx >= n) return candles.map((_, i) => ({ time: times[i] }));

  direction[seedIdx] = 1; // assume long initially
  stop[seedIdx] = closes[seedIdx] - multiplier * atrVals[seedIdx];

  for (let i = seedIdx + 1; i < n; i++) {
    if (isNaN(atrVals[i])) {
      stop[i] = stop[i - 1];
      direction[i] = direction[i - 1];
      continue;
    }

    const prevStop = stop[i - 1];
    const prevDir  = direction[i - 1];
    const dist     = multiplier * atrVals[i];

    if (prevDir === 1) {
      // Long: stop trails below close; never moves down
      const newStop = closes[i] - dist;
      stop[i] = Math.max(newStop, prevStop);
      if (closes[i] < stop[i]) {
        // Price closed below stop → flip to short
        direction[i] = -1;
        stop[i] = closes[i] + dist;
        flip[i] = true;
      } else {
        direction[i] = 1;
      }
    } else {
      // Short: stop trails above close; never moves up
      const newStop = closes[i] + dist;
      stop[i] = Math.min(newStop, prevStop);
      if (closes[i] > stop[i]) {
        // Price closed above stop → flip to long
        direction[i] = 1;
        stop[i] = closes[i] - dist;
        flip[i] = true;
      } else {
        direction[i] = -1;
      }
    }
  }

  // ── Color ──────────────────────────────────────────────────────────────────
  const color = direction.map((d) => {
    if (d === 1)  return 'green';  // Stop is below price (long)
    if (d === -1) return 'red';    // Stop is above price (short)
    return 'neutral';
  });

  // ── Entry risk/reward levels (for each flip / trade entry) ─────────────────
  const rrLevels = candles.map((_, i) => {
    if (!flip[i] || isNaN(stop[i])) return null;
    const entry = closes[i];
    const risk  = Math.abs(entry - stop[i]);
    if (direction[i] === 1) {
      return { entry, stop: stop[i], tp1: entry + risk, tp2: entry + 2 * risk, tp3: entry + 3 * risk };
    } else {
      return { entry, stop: stop[i], tp1: entry - risk, tp2: entry - 2 * risk, tp3: entry - 3 * risk };
    }
  });

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:       times[i],
    stop:       stop[i],        // The trailing stop level
    direction:  direction[i],   // 1 = long bias, -1 = short bias
    color:      color[i],       // 'green' (long) | 'red' (short)
    flip:       flip[i],        // true = stop just flipped direction → potential entry
    rrLevels:   rrLevels[i],    // { entry, stop, tp1, tp2, tp3 } on flip bars
    atr:        atrVals[i],
  }));
}
