/**
 * alpha-volume.js — Alpha Volume reconstruction
 *
 * Documented behavior (Trading Alpha):
 *   A recalculation of volume with added horizontal threshold lines to clearly
 *   define low, high, and extreme areas of volume.
 *
 *   Red line   = high volume threshold   (above = high volume)
 *   Green line = extreme volume threshold (above = extreme volume)
 *
 *   Used to further confirm setups from Alpha Trend and Volatility Suites.
 *   High/extreme volume on a breakout bar increases confidence significantly.
 *
 * Implementation:
 *   Thresholds are derived from rolling percentiles so they adapt to the
 *   asset's typical volume profile. The red line tracks the 75th percentile
 *   and the green line tracks the 95th percentile over the lookback window.
 *
 * Parameters:
 *   period     {number} 50  — Rolling window for percentile calculation
 *   highPct    {number} 75  — Percentile for "high volume" threshold (red line)
 *   extremePct {number} 95  — Percentile for "extreme volume" threshold (green line)
 */

import { sma, percentile, fields } from './utils.js';

export function alphaVolume(candles, options = {}) {
  const { period = 50, highPct = 75, extremePct = 95 } = options;
  const { volumes, times } = fields(candles);
  const n = volumes.length;

  // ── Threshold lines ────────────────────────────────────────────────────────
  const highThreshold    = percentile(volumes, period, highPct);    // red line
  const extremeThreshold = percentile(volumes, period, extremePct); // green line

  // ── Volume zone classification ─────────────────────────────────────────────
  const zone = volumes.map((v, i) => {
    if (isNaN(highThreshold[i])) return 'low';
    if (v >= extremeThreshold[i]) return 'extreme'; // Above green line
    if (v >= highThreshold[i])    return 'high';    // Above red line
    return 'low';                                   // Normal / below red line
  });

  // ── Color per bar ──────────────────────────────────────────────────────────
  const color = zone.map((z) => {
    if (z === 'extreme') return 'green';
    if (z === 'high')    return 'red';
    return 'grey';
  });

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:              times[i],
    volume:            volumes[i],
    highThreshold:     highThreshold[i],     // Red line value
    extremeThreshold:  extremeThreshold[i],  // Green line value
    zone:              zone[i],              // 'low' | 'high' | 'extreme'
    color:             color[i],             // 'grey' | 'red' | 'green'
    isHigh:            zone[i] !== 'low',
    isExtreme:         zone[i] === 'extreme',
  }));
}
