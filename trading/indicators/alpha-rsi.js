/**
 * alpha-rsi.js — Alpha RSI reconstruction
 *
 * Documented behavior:
 *   Three smoothed RSI lines. The "orange" signal line crossing above the
 *   other two indicates bullish momentum. The larger the gap between the
 *   lines, the stronger the momentum signal.
 *
 *   Signals are especially important when RSI is in overbought/oversold
 *   territory at the time of the momentum cross.
 *
 *   Bull/Bear Divergences: price and RSI trending in opposite directions.
 *   Used as confirmation, not standalone signals.
 *
 * Implementation:
 *   signal (orange) = EMA(RSI, fastPeriod)   — crosses first
 *   mid             = EMA(RSI, midPeriod)
 *   slow            = EMA(RSI, slowPeriod)
 *
 *   Bullish momentum:  signal crosses above mid AND signal > slow
 *   Bearish momentum:  signal crosses below mid AND signal < slow
 *   Gap strength:      (signal − mid) + (signal − slow)  [larger = stronger]
 *
 * Parameters:
 *   rsiPeriod   {number} 14  — Base RSI length
 *   fastPeriod  {number} 3   — Signal line (orange) EMA smoothing
 *   midPeriod   {number} 7   — Mid line EMA smoothing
 *   slowPeriod  {number} 14  — Slow line EMA smoothing
 *   obLevel     {number} 70  — Overbought threshold
 *   osLevel     {number} 30  — Oversold threshold
 *   divLookback {number} 14  — Bars to look back for divergences
 */

import { rsi, ema, highest, lowest, fields } from './utils.js';

export function alphaRsi(candles, options = {}) {
  const {
    rsiPeriod   = 14,
    fastPeriod  = 3,
    midPeriod   = 7,
    slowPeriod  = 14,
    obLevel     = 70,
    osLevel     = 30,
    divLookback = 14,
  } = options;

  const { closes, highs, lows, times } = fields(candles);
  const n = closes.length;

  // ── Three RSI lines ────────────────────────────────────────────────────────
  const rsiBase = rsi(closes, rsiPeriod);
  const signal  = ema(rsiBase, fastPeriod);   // orange — fastest
  const mid     = ema(rsiBase, midPeriod);
  const slow    = ema(rsiBase, slowPeriod);

  // ── Momentum cross signals ─────────────────────────────────────────────────
  const bullMomentum = new Array(n).fill(false);
  const bearMomentum = new Array(n).fill(false);
  const momentumStrength = new Array(n).fill(NaN);

  for (let i = 1; i < n; i++) {
    if (isNaN(signal[i]) || isNaN(mid[i]) || isNaN(slow[i])) continue;
    const crossedUp   = signal[i] > mid[i]  && signal[i - 1] <= mid[i - 1];
    const crossedDown = signal[i] < mid[i]  && signal[i - 1] >= mid[i - 1];
    if (crossedUp   && signal[i] > slow[i]) bullMomentum[i] = true;
    if (crossedDown && signal[i] < slow[i]) bearMomentum[i] = true;
    // Gap strength: combined distance from both slower lines
    momentumStrength[i] = (signal[i] - mid[i]) + (signal[i] - slow[i]);
  }

  // ── Overbought / Oversold zone signals ─────────────────────────────────────
  // Especially important when momentum cross occurs at extremes
  const obSignal = bullMomentum.map((b, i) => b && signal[i] > obLevel);
  const osSignal = bearMomentum.map((b, i) => b && signal[i] < osLevel);

  // ── Divergence detection ───────────────────────────────────────────────────
  // Bearish divergence: price makes higher high, RSI makes lower high
  // Bullish divergence: price makes lower low,  RSI makes higher low
  const bullDiv = new Array(n).fill(false);
  const bearDiv = new Array(n).fill(false);

  for (let i = divLookback; i < n; i++) {
    if (isNaN(signal[i])) continue;

    // Find previous swing high (price) and previous RSI high in lookback
    let prevPriceHigh = -Infinity, prevRsiHigh = -Infinity;
    let prevPriceLow  =  Infinity, prevRsiLow  =  Infinity;

    for (let j = i - divLookback; j < i - 2; j++) {
      // Simple swing detection: local max/min with 2-bar confirmation
      const isPriceSwingHigh = highs[j] >= highs[j - 1] && highs[j] >= highs[j + 1] &&
                               highs[j] >= highs[j + 2];
      const isPriceSwingLow  = lows[j]  <= lows[j - 1]  && lows[j]  <= lows[j + 1]  &&
                               lows[j]  <= lows[j + 2];
      if (isPriceSwingHigh && !isNaN(signal[j])) {
        if (highs[j] > prevPriceHigh)  { prevPriceHigh = highs[j];  prevRsiHigh = signal[j]; }
      }
      if (isPriceSwingLow && !isNaN(signal[j])) {
        if (lows[j] < prevPriceLow)    { prevPriceLow  = lows[j];   prevRsiLow  = signal[j]; }
      }
    }

    // Bearish: price higher high but RSI lower high
    if (prevPriceHigh > -Infinity && highs[i] > prevPriceHigh && signal[i] < prevRsiHigh) {
      bearDiv[i] = true;
    }
    // Bullish: price lower low but RSI higher low
    if (prevPriceLow < Infinity && lows[i] < prevPriceLow && signal[i] > prevRsiLow) {
      bullDiv[i] = true;
    }
  }

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:              times[i],
    rsi:               rsiBase[i],        // Raw RSI value
    signal:            signal[i],         // Orange line (fastest)
    mid:               mid[i],            // Mid line
    slow:              slow[i],           // Slow line
    bullMomentum:      bullMomentum[i],   // Orange crossed above both → bullish
    bearMomentum:      bearMomentum[i],   // Orange crossed below both → bearish
    momentumStrength:  momentumStrength[i], // Gap size: larger = stronger signal
    overbought:        !isNaN(signal[i]) && signal[i] > obLevel,
    oversold:          !isNaN(signal[i]) && signal[i] < osLevel,
    obMomentumSignal:  obSignal[i],       // Bull cross at OB — fade/short signal
    osMomentumSignal:  osSignal[i],       // Bear cross at OS — fade/long signal
    bullDivergence:    bullDiv[i],        // Price lower low, RSI higher low
    bearDivergence:    bearDiv[i],        // Price higher high, RSI lower high
  }));
}
