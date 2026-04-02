/**
 * Phoenix Trading Indicators Library
 * Reconstructed from Trading Alpha suite — no TradingView dependency.
 *
 * All indicators accept: candles[] = [{ open, high, low, close, volume, time }, ...]
 * All indicators return: array of signal objects (one per candle)
 *
 * Usage:
 *   import { alphaTrend, htfLtfSuite, alphaRsi } from './indicators/index.js';
 *   const signals = alphaTrend(candles, { coeff: 1.5, ap: 14 });
 *
 * ── Indicator Map ─────────────────────────────────────────────────
 *
 * TREND SUITE (upper chart pane):
 *   alphaTrend   — Core trend line + buy/sell signals, reversal/topping candles
 *   htfLtfSuite  — Volatility squeezes, breakout arrows, momentum bars, TD9
 *
 * CONFIRMATION SUITE (lower panes):
 *   alphaRsi     — 3-line RSI with momentum crosses + bull/bear divergences
 *   alphaThrust  — Institutional buying/selling pressure (green/red/yellow)
 *   alphaVolume  — Volume with high/extreme thresholds
 *
 * VAULT EXCLUSIVES (reconstructed):
 *   alphaStops   — ATR trailing stop with flip signals + R:R levels
 *   phantom      — Hidden divergence + Stochastic RSI signals [APPROXIMATION]
 *
 * UTILITY:
 *   ltfFibonacci — Auto-Fibonacci on detected swing highs/lows
 *   alphaSR      — Dynamic support & resistance from clustered swing points
 */

export { alphaTrend }   from './alpha-trend.js';
export { htfLtfSuite }  from './htf-ltf-suite.js';
export { alphaRsi }     from './alpha-rsi.js';
export { alphaThrust }  from './alpha-thrust.js';
export { alphaVolume }  from './alpha-volume.js';
export { alphaStops, getStopLevel } from './alpha-stops.js';
export { ltfFibonacci } from './ltf-fibonacci.js';
export { alphaSR }      from './alpha-sr.js';
export { phantom }      from './phantom.js';

// Re-export math primitives for custom indicator building
export {
  sma, ema, rma, atr, rsi, mfi,
  stdev, highest, lowest, linreg, percentile,
  crossover, crossunder, fields,
} from './utils.js';
