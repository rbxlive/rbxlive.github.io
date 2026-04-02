/**
 * alpha-sr.js — Alpha Support & Resistance reconstruction
 *
 * Documented behavior (Trading Alpha):
 *   Dynamically generates support and resistance lines — eliminating the need
 *   to draw them manually. Used to spot higher-probability levels, time
 *   breakouts, and confirm volatility breakouts with confluence.
 *
 * Implementation:
 *   Identifies significant swing highs and lows, then clusters nearby levels
 *   into zones (since price often revisits a range rather than an exact level).
 *   Each level tracks how many times price has touched/tested it — more touches
 *   = stronger level.
 *
 *   A "touch" is when price comes within `zoneWidth × ATR` of a level without
 *   closing beyond it.
 *
 * Parameters:
 *   swingLookback {number} 3    — Bars each side to confirm swing point
 *   maxLevels     {number} 8    — Maximum S/R levels to track simultaneously
 *   zoneWidth     {number} 0.25 — Zone width as fraction of ATR
 *   atrPeriod     {number} 14   — ATR period for zone sizing
 */

import { atr, fields } from './utils.js';

export function alphaSR(candles, options = {}) {
  const {
    swingLookback = 3,
    maxLevels     = 8,
    zoneWidth     = 0.25,
    atrPeriod     = 14,
  } = options;

  const { highs, lows, closes, times } = fields(candles);
  const n = candles.length;
  const atrVals = atr(highs, lows, closes, atrPeriod);

  // ── Detect swing highs and lows ────────────────────────────────────────────
  const swingHighs = []; // { index, price }
  const swingLows  = [];

  for (let i = swingLookback; i < n - swingLookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - swingLookback; j <= i + swingLookback; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j]  <= lows[i])  isLow  = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: highs[i] });
    if (isLow)  swingLows.push({  index: i, price: lows[i]  });
  }

  // ── Cluster nearby levels into zones ──────────────────────────────────────
  function clusterLevels(rawLevels, tolerance) {
    const clusters = [];
    for (const { price, index } of rawLevels) {
      const existing = clusters.find((c) => Math.abs(c.price - price) < tolerance);
      if (existing) {
        // Merge: weight toward more recent / higher-touch levels
        existing.price  = (existing.price * existing.touches + price) / (existing.touches + 1);
        existing.touches++;
        existing.lastIndex = Math.max(existing.lastIndex, index);
      } else {
        clusters.push({ price, touches: 1, lastIndex: index });
      }
    }
    return clusters.sort((a, b) => b.touches - a.touches);
  }

  // ── For each bar, return the current active S/R levels ────────────────────
  return candles.map((_, i) => {
    const tolerance = isNaN(atrVals[i]) ? 0.001 * closes[i] : zoneWidth * atrVals[i];

    // Only use swing points confirmed before this bar (no lookahead)
    const pastHighs = swingHighs.filter((s) => s.index <= i - swingLookback);
    const pastLows  = swingLows.filter((s)  => s.index <= i - swingLookback);

    const resistanceLevels = clusterLevels(
      pastHighs.slice(-30), tolerance
    ).slice(0, maxLevels);

    const supportLevels = clusterLevels(
      pastLows.slice(-30), tolerance
    ).slice(0, maxLevels);

    // Classify current price relative to levels
    const price = closes[i];
    const nearestSupport    = supportLevels.find((l) => l.price <= price);
    const nearestResistance = resistanceLevels.find((l) => l.price >= price);

    // Breakout: price closes beyond a level it was previously respecting
    let breakout = null;
    if (nearestResistance && price > nearestResistance.price + tolerance) {
      breakout = { direction: 'up', level: nearestResistance.price, strength: nearestResistance.touches };
    } else if (nearestSupport && price < nearestSupport.price - tolerance) {
      breakout = { direction: 'down', level: nearestSupport.price, strength: nearestSupport.touches };
    }

    return {
      time:               times[i],
      resistance:         resistanceLevels,  // Array of { price, touches, lastIndex }
      support:            supportLevels,     // Array of { price, touches, lastIndex }
      nearestSupport:     nearestSupport    ?? null,
      nearestResistance:  nearestResistance ?? null,
      breakout,           // null | { direction, level, strength }
    };
  });
}
