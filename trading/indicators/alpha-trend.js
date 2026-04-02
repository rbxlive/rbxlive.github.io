/**
 * alpha-trend.js — AlphaTrend reconstruction
 *
 * Based on publicly documented behavior of Trading Alpha's AlphaTrend suite.
 *
 * Core logic (fully documented):
 *   upT[i]  = low[i]  − coeff × ATR(AP)[i]   ← acts as trailing support
 *   downT[i]= high[i] + coeff × ATR(AP)[i]   ← acts as trailing resistance
 *   Filter:  MFI(AP) >= 50 → use upT (uptrend), else downT (downtrend)
 *   AT[i]:  if uptrend  → max(upT[i], AT[i-1])  (never retreats down)
 *           if downtrend→ min(downT[i], AT[i-1]) (never retreats up)
 *   Color:  green when AT[i] >= AT[i-1], red otherwise
 *
 * Signal (crossover of AT with its own 2-bar lag):
 *   BUY  when AT crosses above AT[2]   (green fill appears)
 *   SELL when AT crosses below AT[2]   (red fill appears)
 *
 * Additional signals (Trading Alpha VIP layer):
 *   Reversal candle: large-range bar moving against current AT direction
 *   Topping signal:  AT color flip after extended uptrend + overbought RSI
 *   Micro trend dots: short-term momentum via EMA crossover
 *   Macro trend bars: bar coloring driven by AT direction
 *
 * Parameters (default values match Trading Alpha defaults):
 *   coeff   {number}  1.5  — ATR multiplier (sensitivity)
 *   ap      {number}  14   — Period for ATR, MFI, RSI
 *   useMFI  {boolean} true — Use MFI; set false for no-volume instruments (uses RSI)
 */

import { atr, mfi, rsi, ema, fields } from './utils.js';

export function alphaTrend(candles, options = {}) {
  const { coeff = 1.5, ap = 14, useMFI = true } = options;
  const { highs, lows, closes, volumes, times } = fields(candles);
  const n = closes.length;

  // ── Core trend line ─────────────────────────────────────────────────────────
  const atrVals = atr(highs, lows, closes, ap);
  const filter  = useMFI
    ? mfi(highs, lows, closes, volumes, ap)
    : rsi(closes, ap);

  const upT   = lows.map((l, i)  => l - coeff * (atrVals[i] || 0));
  const downT = highs.map((h, i) => h + coeff * (atrVals[i] || 0));

  const at = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    if (isNaN(atrVals[i]) || isNaN(filter[i])) {
      at[i] = at[i - 1] ?? NaN;
      continue;
    }
    const prevAt = isNaN(at[i - 1]) ? upT[i] : at[i - 1];
    if (filter[i] >= 50) {
      at[i] = Math.max(upT[i], prevAt);    // uptrend: never retreat down
    } else {
      at[i] = Math.min(downT[i], prevAt);  // downtrend: never retreat up
    }
  }

  // ── Color & macro trend bars ────────────────────────────────────────────────
  const color = at.map((v, i) => {
    if (isNaN(v) || i === 0) return 'neutral';
    return v >= at[i - 1] ? 'green' : 'red';
  });

  // ── Buy / Sell signals (AT crosses its 2-bar lag) ───────────────────────────
  const buy  = new Array(n).fill(false);
  const sell = new Array(n).fill(false);
  for (let i = 3; i < n; i++) {
    if (isNaN(at[i]) || isNaN(at[i - 2])) continue;
    if (at[i] > at[i - 2] && at[i - 1] <= at[i - 3]) buy[i]  = true;
    if (at[i] < at[i - 2] && at[i - 1] >= at[i - 3]) sell[i] = true;
  }

  // ── Micro trend dots (fast EMA slope, earliest signal) ─────────────────────
  const fastEma = ema(closes, Math.max(3, Math.round(ap / 3)));
  const microBull = fastEma.map((v, i) => i > 0 && v > fastEma[i - 1]);
  const microBear = fastEma.map((v, i) => i > 0 && v < fastEma[i - 1]);

  // ── Reversal candles (large range bar moving against AT direction) ───────────
  // A "reversal candle" is a bar whose body moves strongly against the current
  // trend direction AND whose range is > 1.5× the recent average range.
  const avgRange = (() => {
    const ranges = closes.map((_, i) => highs[i] - lows[i]);
    const out = new Array(n).fill(NaN);
    for (let i = ap; i < n; i++) {
      let sum = 0;
      for (let j = i - ap + 1; j <= i; j++) sum += ranges[j];
      out[i] = sum / ap;
    }
    return out;
  })();

  const reversalCandle = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (isNaN(avgRange[i])) continue;
    const range = highs[i] - lows[i];
    const body  = Math.abs(closes[i] - candles[i].open);
    const isLarge = range > avgRange[i] * 1.5 && body > range * 0.6;
    if (!isLarge) continue;
    // Counter-trend: green AT but bearish candle, or red AT but bullish candle
    const bearishBar = closes[i] < candles[i].open;
    const bullishBar = closes[i] > candles[i].open;
    if (color[i] === 'green' && bearishBar) reversalCandle[i] = true;
    if (color[i] === 'red'   && bullishBar) reversalCandle[i] = true;
  }

  // ── Topping signals ("T" above bar) ────────────────────────────────────────
  // Appears after extended uptrend when AT color flips red + RSI was overbought
  const rsiVals   = rsi(closes, ap);
  const toppingSignal = new Array(n).fill(false);
  for (let i = ap + 3; i < n; i++) {
    if (color[i] === 'red' && color[i - 1] === 'green' &&
        rsiVals[i - 1] > 65) {
      toppingSignal[i] = true;
    }
  }

  // ── Build output ─────────────────────────────────────────────────────────────
  return candles.map((_, i) => ({
    time:           times[i],
    trend:          at[i],           // The AlphaTrend line value
    color:          color[i],        // 'green' | 'red' | 'neutral'
    buy:            buy[i],          // Strong buy signal
    sell:           sell[i],         // Strong sell signal
    microBull:      microBull[i],    // Micro trend dot — earliest bull signal
    microBear:      microBear[i],    // Micro trend dot — earliest bear signal
    reversalCandle: reversalCandle[i], // Caution — confirm before acting
    toppingSignal:  toppingSignal[i],  // "T" — potential local top
    atr:            atrVals[i],
    filter:         filter[i],       // MFI or RSI value used for direction
  }));
}
