/**
 * alpha-thrust.js — Alpha Thrust approximation
 *
 * Documented behavior (Trading Alpha):
 *   Measures institutional buying & selling pressure — identifies when large
 *   hands (whales/institutions) are entering or exiting.
 *
 *   Color-coded output:
 *     Green  = bullish institutional pressure
 *     Red    = bearish institutional pressure
 *     Yellow = extreme pressure (most powerful signal)
 *
 *   "Change of Powers" = alternating bull → bear or bear → bull bars.
 *   The most powerful signal is an extreme (yellow) bar that is part of a
 *   Change of Powers — signals institutions reversing their bias entirely.
 *
 * Implementation approach:
 *   The exact formula is proprietary. This reconstruction uses Buying/Selling
 *   Pressure derived from price position within the bar range × volume,
 *   smoothed to reduce noise. This is conceptually equivalent to what a
 *   "institutional pressure" indicator would measure.
 *
 *   buyPressure[i]  = ((close - low)  / (high - low)) × volume
 *   sellPressure[i] = ((high - close) / (high - low)) × volume
 *   netPressure[i]  = buyPressure - sellPressure  (normalized by avg volume)
 *   thrust[i]       = EMA(netPressure, smoothing)
 *
 *   Extreme threshold: |thrust| > stdDevMult × stdev(thrust, period)
 *
 * Parameters:
 *   smoothing    {number} 3   — EMA smoothing of net pressure
 *   period       {number} 20  — Lookback for standard deviation (extreme detection)
 *   stdDevMult   {number} 1.8 — Multiplier for extreme threshold
 */

import { ema, stdev, sma, fields } from './utils.js';

export function alphaThrust(candles, options = {}) {
  const { smoothing = 3, period = 20, stdDevMult = 1.8 } = options;
  const { highs, lows, closes, volumes, times } = fields(candles);
  const n = closes.length;

  // ── Net pressure per bar ───────────────────────────────────────────────────
  const avgVol = sma(volumes, period);
  const rawPressure = closes.map((c, i) => {
    const range = highs[i] - lows[i];
    if (range === 0) return 0;
    const bp = ((c - lows[i])  / range) * volumes[i];
    const sp = ((highs[i] - c) / range) * volumes[i];
    // Normalize by rolling average volume to make comparable across time
    const av = avgVol[i] || 1;
    return (bp - sp) / av;
  });

  // ── Smooth the pressure ────────────────────────────────────────────────────
  const thrust = ema(rawPressure, smoothing);

  // ── Extreme threshold ──────────────────────────────────────────────────────
  const thrustSd = stdev(thrust, period);
  const isExtreme = thrust.map((v, i) =>
    !isNaN(v) && !isNaN(thrustSd[i]) && Math.abs(v) > stdDevMult * thrustSd[i]
  );

  // ── Color coding ───────────────────────────────────────────────────────────
  const color = thrust.map((v, i) => {
    if (isNaN(v)) return 'neutral';
    if (isExtreme[i]) return 'yellow';  // Extreme — most powerful signal
    return v > 0 ? 'green' : 'red';
  });

  // ── Change of Powers detection ────────────────────────────────────────────
  // Alternating bull → bear (or bear → bull) consecutive bars
  const changeOfPowers = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (isNaN(thrust[i]) || isNaN(thrust[i - 1])) continue;
    const prevBull = thrust[i - 1] > 0;
    const currBull = thrust[i] > 0;
    if (prevBull !== currBull) changeOfPowers[i] = true;
  }

  // Extreme Change of Powers = extreme bar + direction flip = highest alert
  const extremeChangeOfPowers = changeOfPowers.map((cop, i) => cop && isExtreme[i]);

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:                  times[i],
    thrust:                thrust[i],             // Raw value (+ bull, − bear)
    color:                 color[i],              // 'green' | 'red' | 'yellow' | 'neutral'
    isExtreme:             isExtreme[i],          // Yellow bar — institutional activity
    changeOfPowers:        changeOfPowers[i],     // Direction flip — caution
    extremeChangeOfPowers: extremeChangeOfPowers[i], // Yellow + flip = highest priority signal
  }));
}
