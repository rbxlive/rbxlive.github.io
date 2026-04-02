/**
 * htf-ltf-suite.js — HTF & LTF Suite reconstruction
 *
 * The HTF and LTF suites are structurally identical; only the intended
 * timeframe differs (HTF: Weekly/Daily/4H, LTF: 4H/1H/30m/15m/5m).
 * Use the same function for both — just apply it to OHLCV data of the
 * desired timeframe.
 *
 * Components (all publicly documented):
 *
 * 1. VOLATILITY SQUEEZE (yellow shading)
 *    Bollinger Bands contract inside Keltner Channels = squeeze is ON.
 *    Squeeze signals that a violent breakout is imminent (direction unknown).
 *    Based on John Carter's TTM Squeeze concept.
 *
 * 2. MOMENTUM HISTOGRAM
 *    Linear regression of delta between price and midpoint.
 *    Rising histogram = bullish momentum, falling = bearish.
 *    Color of histogram bars indicates direction of expected squeeze breakout.
 *
 * 3. BREAKOUT ARROWS
 *    Potential arrow: first bar when squeeze turns OFF.
 *    Confirmed arrow: momentum histogram direction holds for 2+ bars after breakout.
 *
 * 4. MOMENTUM BARS (green / red bars on chart)
 *    Green bar: bullish momentum (often precedes white/uptrend bars).
 *    Red bar:   bearish momentum (often precedes grey/downtrend bars).
 *
 * 5. TREND BARS (white = uptrend, grey = downtrend)
 *    Determined by fast vs slow EMA relationship.
 *
 * 6. TD9 OVERBOUGHT / OVERSOLD (8/9 signals)
 *    Buy setup:  9 consecutive closes each BELOW the close 4 bars ago → bullish oversold.
 *    Sell setup: 9 consecutive closes each ABOVE the close 4 bars ago → bearish overbought.
 *    Signals print at count 8 (early warning) and 9 (full signal).
 *
 * Parameters:
 *   bbPeriod    {number} 20   — Bollinger Band period
 *   bbMult      {number} 2.0  — BB standard deviation multiplier
 *   kcPeriod    {number} 20   — Keltner Channel period
 *   kcMult      {number} 1.5  — KC ATR multiplier
 *   momentumLen {number} 12   — Linear regression period for momentum
 *   fastEma     {number} 21   — Fast EMA for trend bars
 *   slowEma     {number} 55   — Slow EMA for trend bars
 */

import { sma, ema, atr, stdev, highest, lowest, linreg, fields } from './utils.js';

export function htfLtfSuite(candles, options = {}) {
  const {
    bbPeriod    = 20,
    bbMult      = 2.0,
    kcPeriod    = 20,
    kcMult      = 1.5,
    momentumLen = 12,
    fastEmaPer  = 21,
    slowEmaPer  = 55,
  } = options;

  const { highs, lows, closes, times } = fields(candles);
  const n = closes.length;

  // ── 1. Volatility Squeeze ──────────────────────────────────────────────────
  const bbBasis = sma(closes, bbPeriod);
  const bbSd    = stdev(closes, bbPeriod);
  const bbUpper = bbBasis.map((b, i) => b + bbMult * (bbSd[i] || 0));
  const bbLower = bbBasis.map((b, i) => b - bbMult * (bbSd[i] || 0));

  const atrVals = atr(highs, lows, closes, kcPeriod);
  const kcBasis = ema(closes, kcPeriod);
  const kcUpper = kcBasis.map((b, i) => b + kcMult * (atrVals[i] || 0));
  const kcLower = kcBasis.map((b, i) => b - kcMult * (atrVals[i] || 0));

  // Squeeze is ON when BB is inside KC (compressed volatility)
  const squeezeOn = bbUpper.map((u, i) =>
    !isNaN(u) && !isNaN(kcUpper[i]) && u < kcUpper[i] && bbLower[i] > kcLower[i]
  );

  // ── 2. Momentum Histogram ──────────────────────────────────────────────────
  // delta = close − average of (highest high + lowest low + SMA) / 2
  const highN = highest(highs, bbPeriod);
  const lowN  = lowest(lows,   bbPeriod);
  const delta = closes.map((c, i) =>
    isNaN(highN[i]) ? NaN : c - (highN[i] + lowN[i] + bbBasis[i]) / 3
  );
  const momentum = linreg(delta, momentumLen);

  const momentumColor = momentum.map((m, i) => {
    if (isNaN(m)) return 'neutral';
    if (i === 0)  return m >= 0 ? 'brightGreen' : 'brightRed';
    const prev = momentum[i - 1];
    if (m >= 0) return m > prev ? 'brightGreen' : 'dimGreen';
    return m < prev ? 'brightRed' : 'dimRed';
  });

  // ── 3. Breakout Arrows ─────────────────────────────────────────────────────
  const potentialArrow  = new Array(n).fill(null);  // 'bull' | 'bear' | null
  const confirmedArrow  = new Array(n).fill(null);
  let wasInSqueeze = false;

  for (let i = 1; i < n; i++) {
    const justBroke = wasInSqueeze && !squeezeOn[i];
    if (justBroke) {
      potentialArrow[i] = momentum[i] >= 0 ? 'bull' : 'bear';
    }
    // Confirmed: potential arrow direction holds for 2 consecutive bars
    if (i >= 2 && potentialArrow[i - 1] !== null) {
      const dir = potentialArrow[i - 1];
      const holds = dir === 'bull'
        ? momentum[i] > 0 && momentum[i] >= momentum[i - 1]
        : momentum[i] < 0 && momentum[i] <= momentum[i - 1];
      if (holds) confirmedArrow[i] = dir;
    }
    wasInSqueeze = squeezeOn[i];
  }

  // ── 4 & 5. Momentum Bars + Trend Bars ─────────────────────────────────────
  const fastEmaVals = ema(closes, fastEmaPer);
  const slowEmaVals = ema(closes, slowEmaPer);

  const barColor = closes.map((c, i) => {
    if (isNaN(fastEmaVals[i]) || isNaN(slowEmaVals[i])) return 'neutral';
    const uptrend   = fastEmaVals[i] > slowEmaVals[i];
    const momBull   = !isNaN(momentum[i]) && momentum[i] > 0;
    const momBear   = !isNaN(momentum[i]) && momentum[i] < 0;

    if (uptrend && momBull)  return 'white';       // Strong uptrend
    if (uptrend && !momBull) return 'green';        // Uptrend, momentum fading
    if (!uptrend && momBear) return 'grey';         // Strong downtrend
    return 'red';                                   // Downtrend, momentum fading
  });

  // ── 6. TD9 Overbought / Oversold ──────────────────────────────────────────
  const td9 = new Array(n).fill(0);
  let buyCount = 0, sellCount = 0;
  for (let i = 4; i < n; i++) {
    if (closes[i] < closes[i - 4]) {
      buyCount++;
      sellCount = 0;
    } else if (closes[i] > closes[i - 4]) {
      sellCount++;
      buyCount = 0;
    } else {
      buyCount = 0;
      sellCount = 0;
    }
    // Cap at 9 (reset after 9)
    if (buyCount > 9)  buyCount = 0;
    if (sellCount > 9) sellCount = 0;
    if (buyCount > 0)   td9[i] = buyCount;     // positive = buy setup
    if (sellCount > 0)  td9[i] = -sellCount;   // negative = sell setup
  }

  const td9Signal = td9.map((v) => {
    if (v === 8)  return 'buyWarning';
    if (v === 9)  return 'buySignal';
    if (v === -8) return 'sellWarning';
    if (v === -9) return 'sellSignal';
    return null;
  });

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:             times[i],
    squeezeOn:        squeezeOn[i],       // true = yellow shading, breakout imminent
    momentum:         momentum[i],         // histogram value
    momentumColor:    momentumColor[i],    // 'brightGreen'|'dimGreen'|'brightRed'|'dimRed'
    potentialArrow:   potentialArrow[i],   // 'bull' | 'bear' | null
    confirmedArrow:   confirmedArrow[i],   // 'bull' | 'bear' | null — highest probability
    barColor:         barColor[i],         // 'white'|'green'|'grey'|'red'|'neutral'
    td9Count:         td9[i],              // raw count (+ve buy setup, -ve sell setup)
    td9Signal:        td9Signal[i],        // 'buyWarning'|'buySignal'|'sellWarning'|'sellSignal'|null
    fastEma:          fastEmaVals[i],
    slowEma:          slowEmaVals[i],
  }));
}
