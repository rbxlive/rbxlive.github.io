/**
 * ltf-fibonacci.js — LTF Auto-Fibonacci reconstruction
 *
 * Automatically identifies the most recent significant swing high and swing
 * low within a lookback window, then draws Fibonacci retracement levels
 * between them. Refreshes as new swing points are detected.
 *
 * Standard Fibonacci levels: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0
 * Extension levels (beyond the range): 1.272, 1.618
 *
 * In an uptrend: low = 0%, high = 100% (measuring pullbacks)
 * In a downtrend: high = 0%, low = 100% (measuring bounces)
 *
 * Trend direction is determined by whether the swing high or swing low
 * was formed most recently.
 *
 * Parameters:
 *   swingLookback {number} 5   — Bars each side to confirm a swing point
 *   rangeLookback {number} 50  — Bars to search back for the swing anchor points
 */

import { fields } from './utils.js';

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618];

export function ltfFibonacci(candles, options = {}) {
  const { swingLookback = 5, rangeLookback = 50 } = options;
  const { highs, lows, times } = fields(candles);
  const n = candles.length;

  // ── Swing point detection ──────────────────────────────────────────────────
  // A swing high at bar i: high[i] is max over [i-lb, i+lb]
  // A swing low  at bar i: low[i]  is min over [i-lb, i+lb]
  // Note: requires `swingLookback` bars on BOTH sides — last lb bars are unconfirmed.
  const isSwingHigh = new Array(n).fill(false);
  const isSwingLow  = new Array(n).fill(false);

  for (let i = swingLookback; i < n - swingLookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - swingLookback; j <= i + swingLookback; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j]  <= lows[i])  isLow  = false;
    }
    isSwingHigh[i] = isHigh;
    isSwingLow[i]  = isLow;
  }

  // ── For each bar, find the most recent swing high and low ──────────────────
  const results = candles.map((_, i) => {
    const lookStart = Math.max(0, i - rangeLookback);

    let swingHighIdx = -1, swingLowIdx = -1;
    let swingHighVal = -Infinity, swingLowVal = Infinity;

    for (let j = lookStart; j <= i; j++) {
      if (isSwingHigh[j] && highs[j] > swingHighVal) {
        swingHighVal = highs[j];
        swingHighIdx = j;
      }
      if (isSwingLow[j] && lows[j] < swingLowVal) {
        swingLowVal = lows[j];
        swingLowIdx = j;
      }
    }

    if (swingHighIdx === -1 || swingLowIdx === -1) {
      return { time: times[i], levels: null, trend: null };
    }

    // Trend: which swing point is more recent?
    const uptrend = swingLowIdx > swingHighIdx;
    const anchor  = uptrend ? swingLowVal  : swingHighVal;
    const target  = uptrend ? swingHighVal : swingLowVal;
    const range   = target - anchor;

    // Fib levels: anchor + level * range
    const levels = {};
    for (const lvl of FIB_LEVELS) {
      const price = uptrend
        ? anchor + lvl * range           // measuring up from low
        : anchor - lvl * Math.abs(range); // measuring down from high
      levels[lvl] = price;
    }

    return {
      time:       times[i],
      trend:      uptrend ? 'up' : 'down',
      swingHigh:  { price: swingHighVal, index: swingHighIdx },
      swingLow:   { price: swingLowVal,  index: swingLowIdx  },
      anchor,
      target,
      levels,      // { 0: price, 0.236: price, 0.382: price, ... }
      // Convenience: key levels for quick access
      fib236:  levels[0.236],
      fib382:  levels[0.382],
      fib500:  levels[0.5],
      fib618:  levels[0.618],
      fib786:  levels[0.786],
      fib1618: levels[1.618],
    };
  });

  return results;
}
