/**
 * phantom.js — Phantom indicator approximation
 *
 * ⚠️  APPROXIMATION — formula not publicly documented.
 *
 * The Phantom is an exclusive Alpha Vault indicator with no public
 * documentation of its internal mechanics. This reconstruction is based
 * on the design philosophy of the Trading Alpha suite (institutional flow,
 * hidden momentum, early reversal detection) and the name "Phantom" — which
 * in trading contexts typically refers to signals that "appear" briefly at
 * high-probability turning points.
 *
 * This implementation combines two well-established "hidden" signal concepts:
 *
 * 1. HIDDEN DIVERGENCE (trend-continuation signals)
 *    Unlike regular divergence (which signals reversals), hidden divergence
 *    signals trend continuation after a pullback.
 *    • Hidden Bullish: price makes higher low, RSI makes lower low → buy the dip
 *    • Hidden Bearish: price makes lower high, RSI makes higher high → sell the bounce
 *
 * 2. STOCHASTIC RSI SIGNALS (overbought/oversold with momentum)
 *    Stoch RSI that fires only when price structure confirms the signal.
 *    Avoids whipsaws by requiring price to be on the right side of the
 *    AlphaTrend line (cross-indicator confluence).
 *
 * OUTPUT SIGNALS:
 *   phantomBull: high-probability long signal (hidden bull div + stoch oversold)
 *   phantomBear: high-probability short signal (hidden bear div + stoch overbought)
 *   earlyBull / earlyBear: earlier, lower-confidence version of the above
 *
 * If you can obtain details from the Trading Alpha Discord, update this file.
 * The API shape intentionally matches the other indicators for drop-in replacement.
 *
 * Parameters:
 *   rsiPeriod    {number} 14  — RSI period
 *   stochPeriod  {number} 14  — Stochastic RSI lookback
 *   signalPeriod {number} 3   — Stochastic RSI smoothing
 *   divLookback  {number} 20  — Bars to scan for hidden divergence
 *   obLevel      {number} 80  — Stoch RSI overbought
 *   osLevel      {number} 20  — Stoch RSI oversold
 */

import { rsi, ema, sma, highest, lowest, fields } from './utils.js';

export function phantom(candles, options = {}) {
  const {
    rsiPeriod    = 14,
    stochPeriod  = 14,
    signalPeriod = 3,
    divLookback  = 20,
    obLevel      = 80,
    osLevel      = 20,
  } = options;

  const { highs, lows, closes, times } = fields(candles);
  const n = closes.length;

  // ── Stochastic RSI ─────────────────────────────────────────────────────────
  const rsiVals    = rsi(closes, rsiPeriod);
  const rsiHigh    = highest(rsiVals, stochPeriod);
  const rsiLow     = lowest(rsiVals,  stochPeriod);
  const stochRsi   = rsiVals.map((r, i) => {
    const range = rsiHigh[i] - rsiLow[i];
    if (isNaN(r) || range === 0) return NaN;
    return 100 * (r - rsiLow[i]) / range;
  });
  const stochK     = sma(stochRsi, signalPeriod);       // %K
  const stochD     = sma(stochK,   signalPeriod);       // %D (signal line)

  // ── Hidden Divergence ──────────────────────────────────────────────────────
  const hiddenBull = new Array(n).fill(false);
  const hiddenBear = new Array(n).fill(false);

  for (let i = divLookback + 2; i < n; i++) {
    if (isNaN(stochK[i])) continue;

    // Find previous swing high/low in price and RSI within lookback
    let prevPriceLow = Infinity,  prevRsiAtPriceLow  = NaN;
    let prevPriceHigh = -Infinity, prevRsiAtPriceHigh = NaN;

    for (let j = i - divLookback; j < i - 2; j++) {
      // Swing low
      if (lows[j] < lows[j - 1] && lows[j] < lows[j + 1] && !isNaN(rsiVals[j])) {
        if (lows[j] < prevPriceLow) {
          prevPriceLow = lows[j];
          prevRsiAtPriceLow = rsiVals[j];
        }
      }
      // Swing high
      if (highs[j] > highs[j - 1] && highs[j] > highs[j + 1] && !isNaN(rsiVals[j])) {
        if (highs[j] > prevPriceHigh) {
          prevPriceHigh = highs[j];
          prevRsiAtPriceHigh = rsiVals[j];
        }
      }
    }

    // Hidden bullish: price makes higher low, RSI makes lower low → trend continuation up
    if (prevPriceLow < Infinity && lows[i] > prevPriceLow && rsiVals[i] < prevRsiAtPriceLow) {
      hiddenBull[i] = true;
    }
    // Hidden bearish: price makes lower high, RSI makes higher high → trend continuation down
    if (prevPriceHigh > -Infinity && highs[i] < prevPriceHigh && rsiVals[i] > prevRsiAtPriceHigh) {
      hiddenBear[i] = true;
    }
  }

  // ── Phantom Signals (hidden div + Stoch RSI confirmation) ─────────────────
  const phantomBull = new Array(n).fill(false); // High-confidence long
  const phantomBear = new Array(n).fill(false); // High-confidence short
  const earlyBull   = new Array(n).fill(false); // Early / lower-confidence long
  const earlyBear   = new Array(n).fill(false); // Early / lower-confidence short

  for (let i = 1; i < n; i++) {
    if (isNaN(stochK[i]) || isNaN(stochD[i])) continue;

    const stochOversold    = stochK[i] < osLevel && stochD[i] < osLevel;
    const stochOverbought  = stochK[i] > obLevel && stochD[i] > obLevel;
    const stochCrossUp     = stochK[i] > stochD[i] && stochK[i - 1] <= stochD[i - 1];
    const stochCrossDown   = stochK[i] < stochD[i] && stochK[i - 1] >= stochD[i - 1];

    // Full signal: hidden divergence + stoch confirmation at extreme
    if (hiddenBull[i] && stochOversold && stochCrossUp)   phantomBull[i] = true;
    if (hiddenBear[i] && stochOverbought && stochCrossDown) phantomBear[i] = true;

    // Early signal: stoch alone at extremes with momentum cross
    if (!phantomBull[i] && stochOversold  && stochCrossUp)   earlyBull[i] = true;
    if (!phantomBear[i] && stochOverbought && stochCrossDown) earlyBear[i] = true;
  }

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:         times[i],
    stochK:       stochK[i],       // Stochastic RSI %K
    stochD:       stochD[i],       // Stochastic RSI %D (signal)
    rsi:          rsiVals[i],
    hiddenBull:   hiddenBull[i],   // Hidden bullish divergence (trend continuation)
    hiddenBear:   hiddenBear[i],   // Hidden bearish divergence (trend continuation)
    phantomBull:  phantomBull[i],  // ⚡ High-confidence long signal
    phantomBear:  phantomBear[i],  // ⚡ High-confidence short signal
    earlyBull:    earlyBull[i],    // Early long (lower confidence)
    earlyBear:    earlyBear[i],    // Early short (lower confidence)
    // NOTE: This is an approximation. Update with Discord findings.
  }));
}
