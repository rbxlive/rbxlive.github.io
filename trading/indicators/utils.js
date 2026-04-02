/**
 * utils.js — Shared technical analysis math
 * All functions operate on plain number arrays and return arrays of the same
 * length. Warmup bars that cannot be computed are filled with NaN.
 *
 * Candle shape expected by indicator files:
 *   { open, high, low, close, volume, time }
 */

// ── Simple Moving Average ─────────────────────────────────────────────────────

export function sma(values, period) {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// ── Exponential Moving Average ────────────────────────────────────────────────

export function ema(values, period) {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    if (isNaN(values[i])) continue;
    if (isNaN(prev)) {
      // Seed with first valid value
      prev = values[i];
      out[i] = prev;
    } else {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// ── Wilder's RMA (used in ATR, RSI) ──────────────────────────────────────────

export function rma(values, period) {
  const out = new Array(values.length).fill(NaN);
  const k = 1 / period;
  let prev = NaN;
  // Seed with SMA of first `period` values
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    if (isNaN(values[i])) continue;
    if (count < period) {
      sum += values[i];
      count++;
      if (count === period) {
        prev = sum / period;
        out[i] = prev;
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// ── Average True Range ────────────────────────────────────────────────────────

export function atr(highs, lows, closes, period) {
  const tr = new Array(closes.length).fill(NaN);
  for (let i = 1; i < closes.length; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  return rma(tr, period);
}

// ── Relative Strength Index ───────────────────────────────────────────────────

export function rsi(closes, period) {
  const gains = new Array(closes.length).fill(NaN);
  const losses = new Array(closes.length).fill(NaN);
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gains[i] = Math.max(delta, 0);
    losses[i] = Math.max(-delta, 0);
  }
  const avgGain = rma(gains, period);
  const avgLoss = rma(losses, period);
  return avgGain.map((g, i) => {
    if (isNaN(g) || isNaN(avgLoss[i])) return NaN;
    if (avgLoss[i] === 0) return 100;
    return 100 - 100 / (1 + g / avgLoss[i]);
  });
}

// ── Money Flow Index ──────────────────────────────────────────────────────────

export function mfi(highs, lows, closes, volumes, period) {
  const n = closes.length;
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const mf = tp.map((t, i) => t * volumes[i]);
  const out = new Array(n).fill(NaN);

  for (let i = period; i < n; i++) {
    let pmf = 0, nmf = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pmf += mf[j];
      else if (tp[j] < tp[j - 1]) nmf += mf[j];
    }
    if (nmf === 0) { out[i] = 100; continue; }
    out[i] = 100 - 100 / (1 + pmf / nmf);
  }
  return out;
}

// ── Standard Deviation ────────────────────────────────────────────────────────

export function stdev(values, period) {
  const means = sma(values, period);
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (values[j] - means[i]) ** 2;
    }
    out[i] = Math.sqrt(variance / period);
  }
  return out;
}

// ── Rolling Highest / Lowest ──────────────────────────────────────────────────

export function highest(values, period) {
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) max = Math.max(max, values[j]);
    out[i] = max;
  }
  return out;
}

export function lowest(values, period) {
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) min = Math.min(min, values[j]);
    out[i] = min;
  }
  return out;
}

// ── Linear Regression Value ───────────────────────────────────────────────────
// Returns the endpoint of the best-fit line through the last `period` values.

export function linreg(values, period) {
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < period; j++) {
      const x = j;
      const y = values[i - period + 1 + j];
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    }
    const denom = period * sumX2 - sumX * sumX;
    if (denom === 0) { out[i] = values[i]; continue; }
    const slope = (period * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / period;
    out[i] = intercept + slope * (period - 1);
  }
  return out;
}

// ── Percentile (rolling) ──────────────────────────────────────────────────────

export function percentile(values, period, pct) {
  const out = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1).filter((v) => !isNaN(v)).sort((a, b) => a - b);
    const idx = Math.floor((pct / 100) * (window.length - 1));
    out[i] = window[idx];
  }
  return out;
}

// ── Crossover / Crossunder ────────────────────────────────────────────────────

export function crossover(a, b) {
  return a.map((v, i) => {
    if (i === 0) return false;
    return a[i] > b[i] && a[i - 1] <= b[i - 1];
  });
}

export function crossunder(a, b) {
  return a.map((v, i) => {
    if (i === 0) return false;
    return a[i] < b[i] && a[i - 1] >= b[i - 1];
  });
}

// ── Extract candle fields ─────────────────────────────────────────────────────

export function fields(candles) {
  return {
    opens:   candles.map((c) => c.open),
    highs:   candles.map((c) => c.high),
    lows:    candles.map((c) => c.low),
    closes:  candles.map((c) => c.close),
    volumes: candles.map((c) => c.volume ?? 0),
    times:   candles.map((c) => c.time),
  };
}
