/**
 * phantom.js — Phantom indicator reconstruction
 *
 * Visual behavior confirmed from Trading Alpha documentation and chart images:
 *
 *   • Separate lower pane — purple histogram oscillating around zero
 *   • Positive bars (dark purple) = bullish cycle strength
 *   • Negative bars (lighter/pink) = bearish cycle weakness
 *   • Scale: approximately ±3 (matches Z-score standard deviation range)
 *   • Works across all timeframes (1M, 1D, 4H confirmed)
 *   • Stays directional through corrections — doesn't whipsaw
 *   • Shows divergences: price making new highs while phantom bars shrink = weakness
 *   • Phantom trending UP while still negative = early bull flip warning
 *   • Phantom trending DOWN while still positive = early bear flip warning
 *
 * Formula reconstruction (Z-score based):
 *   The ±3 scale and "stays directional through full market cycles" behavior
 *   points to a smoothed Z-score — how many standard deviations price is
 *   above or below its rolling mean. This naturally:
 *     - Stays positive for entire bull markets (price consistently above mean)
 *     - Goes negative during sustained downtrends
 *     - Shows divergence when price makes new highs but Z-score shrinks
 *     - Works identically across all timeframes via the period parameter
 *
 *   raw[i]    = (close[i] − SMA(close, period)[i]) / stdev(close, period)[i]
 *   phantom[i]= EMA(raw, smoothing)[i]
 *
 * Parameters (confirmed: ATR period 11 visible on chart for Alpha Stops,
 *   suggesting Trading Alpha favors shorter periods than typical defaults):
 *   period    {number} 100 — Rolling window for mean/stdev (adapts to timeframe)
 *   smoothing {number} 10  — EMA smoothing of raw Z-score
 *   divLook   {number} 20  — Bars to scan back for divergence detection
 */

import { sma, ema, stdev, fields } from './utils.js';

export function phantom(candles, options = {}) {
  const {
    period    = 100,
    smoothing = 10,
    divLook   = 20,
  } = options;

  const { closes, highs, lows, times } = fields(candles);
  const n = closes.length;

  // ── Core Z-score calculation ───────────────────────────────────────────────
  const mean   = sma(closes, period);
  const sd     = stdev(closes, period);

  const raw = closes.map((c, i) => {
    if (isNaN(mean[i]) || isNaN(sd[i]) || sd[i] === 0) return NaN;
    return (c - mean[i]) / sd[i];
  });

  const phantom = ema(raw, smoothing);

  // ── Bullish / Bearish state ────────────────────────────────────────────────
  const bullish = phantom.map((v) => !isNaN(v) && v > 0);
  const bearish = phantom.map((v) => !isNaN(v) && v < 0);

  // Color for histogram rendering:
  //   'purple'     = positive (bull strength)
  //   'pink'       = negative (bear weakness)
  //   'neutral'    = NaN / warmup
  const color = phantom.map((v) => {
    if (isNaN(v)) return 'neutral';
    return v >= 0 ? 'purple' : 'pink';
  });

  // ── Slope / trend of the Phantom line itself ──────────────────────────────
  // Rising phantom while bearish = early bull flip warning (key signal from docs)
  // Falling phantom while bullish = early bear flip warning
  const slopePeriod = 3;
  const rising  = new Array(n).fill(false);
  const falling = new Array(n).fill(false);
  for (let i = slopePeriod; i < n; i++) {
    if (isNaN(phantom[i]) || isNaN(phantom[i - slopePeriod])) continue;
    rising[i]  = phantom[i] > phantom[i - slopePeriod];
    falling[i] = phantom[i] < phantom[i - slopePeriod];
  }

  // ── Leading flip signals ───────────────────────────────────────────────────
  // leadingBull: phantom is negative but has been consistently rising
  // leadingBear: phantom is positive but has been consistently falling
  const leadingBull = new Array(n).fill(false);
  const leadingBear = new Array(n).fill(false);
  for (let i = slopePeriod; i < n; i++) {
    if (isNaN(phantom[i])) continue;
    if (bearish[i] && rising[i])  leadingBull[i] = true;
    if (bullish[i] && falling[i]) leadingBear[i] = true;
  }

  // ── Zero-line crossovers (actual bull/bear flips) ──────────────────────────
  const bullFlip = new Array(n).fill(false);
  const bearFlip = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (isNaN(phantom[i]) || isNaN(phantom[i - 1])) continue;
    if (phantom[i] >= 0 && phantom[i - 1] < 0) bullFlip[i] = true;
    if (phantom[i] <  0 && phantom[i - 1] >= 0) bearFlip[i] = true;
  }

  // ── Divergence detection ───────────────────────────────────────────────────
  // Bearish divergence: price makes higher high, phantom makes lower high
  //   → trend weakness, likely upcoming reversal or slowdown
  // Bullish divergence: price makes lower low, phantom makes higher low
  //   → selling pressure weakening, potential reversal
  const bullDiv = new Array(n).fill(false);
  const bearDiv = new Array(n).fill(false);

  for (let i = divLook + 2; i < n; i++) {
    if (isNaN(phantom[i])) continue;

    let prevPriceLow  =  Infinity, prevPhantomAtLow  = NaN;
    let prevPriceHigh = -Infinity, prevPhantomAtHigh = NaN;

    for (let j = i - divLook; j < i - 1; j++) {
      if (j < 1 || isNaN(phantom[j])) continue;
      // Simple swing detection
      if (lows[j] < lows[j - 1] && lows[j] < lows[j + 1]) {
        if (lows[j] < prevPriceLow) {
          prevPriceLow = lows[j];
          prevPhantomAtLow = phantom[j];
        }
      }
      if (highs[j] > highs[j - 1] && highs[j] > highs[j + 1]) {
        if (highs[j] > prevPriceHigh) {
          prevPriceHigh = highs[j];
          prevPhantomAtHigh = phantom[j];
        }
      }
    }

    // Bearish: price higher high but phantom lower high
    if (prevPriceHigh > -Infinity && highs[i] > prevPriceHigh &&
        !isNaN(prevPhantomAtHigh) && phantom[i] < prevPhantomAtHigh) {
      bearDiv[i] = true;
    }
    // Bullish: price lower low but phantom higher low
    if (prevPriceLow < Infinity && lows[i] < prevPriceLow &&
        !isNaN(prevPhantomAtLow) && phantom[i] > prevPhantomAtLow) {
      bullDiv[i] = true;
    }
  }

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:        times[i],
    value:       phantom[i],     // Histogram value — plot this in lower pane
    color:       color[i],       // 'purple' (positive) | 'pink' (negative) | 'neutral'
    bullish:     bullish[i],     // value > 0
    bearish:     bearish[i],     // value < 0
    rising:      rising[i],      // Phantom trending up
    falling:     falling[i],     // Phantom trending down
    leadingBull: leadingBull[i], // ⚡ Bearish but rising — bull flip incoming
    leadingBear: leadingBear[i], // ⚡ Bullish but falling — bear flip incoming
    bullFlip:    bullFlip[i],    // Crossed above zero — official bull signal
    bearFlip:    bearFlip[i],    // Crossed below zero — official bear signal
    bullDiv:     bullDiv[i],     // Price lower low, phantom higher low — buy
    bearDiv:     bearDiv[i],     // Price higher high, phantom lower high — sell
  }));
}
