/**
 * validate-alphatrend.js
 * Compares our alphaTrend implementation against TradingView exported values.
 *
 * Usage (from repo root):
 *   node trading/indicators/validate-alphatrend.js
 *
 * Expects: alphatrend-export.csv in repo root
 * CSV columns: time, open, high, low, close, _, _, Chars, _, _, _, _,
 *              Bullish Micro Trend, Bearish Micro Trend, Alpha Track
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { alphaTrend } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath   = path.resolve(__dirname, '../../alphatrend-export.csv');

// ── Parse CSV ──────────────────────────────────────────────────────────────────
const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const header = lines[0].split(',');
console.log('Columns detected:', header.map((h, i) => `[${i}] ${h.trim() || '(blank)'}`).join(', '));
console.log('Total rows:', lines.length - 1);
console.log('');

const candles = [];
const tvAt    = [];  // TradingView's Alpha Track values
const tvMicroBull = [];
const tvMicroBear = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < 15) continue;

  const time   = parseInt(cols[0]);
  const open   = parseFloat(cols[1]);
  const high   = parseFloat(cols[2]);
  const low    = parseFloat(cols[3]);
  const close  = parseFloat(cols[4]);
  const bull   = parseFloat(cols[12]);  // Bullish Micro Trend
  const bear   = parseFloat(cols[13]);  // Bearish Micro Trend
  const at     = parseFloat(cols[14]);  // Alpha Track
  const volume = parseFloat(cols[15]);  // Volume

  if (isNaN(close) || isNaN(high) || isNaN(low)) continue;

  candles.push({ time, open, high, low, close, volume: isNaN(volume) ? 1 : volume });
  tvAt.push(at);
  tvMicroBull.push(bull === 1);
  tvMicroBear.push(bear === 1);
}

// ── Run our implementation ─────────────────────────────────────────────────────
// Note: CSV has no volume column — AlphaTrend uses MFI which needs volume.
// We'll test with useMFI: false (RSI fallback) since there's no volume data.
// If results are poor, the real indicator IS using MFI — we'd need a vol-included export.
const results = alphaTrend(candles, { coeff: 1.5, ap: 14, useMFI: true });

// ── Compare Alpha Track (AT line) ─────────────────────────────────────────────
console.log('=== ALPHA TRACK LINE COMPARISON ===');
const warmup = 30; // skip warmup bars
let sumAbsErr = 0, maxAbsErr = 0, maxErrIdx = -1;
let validCount = 0;
let sumPctErr = 0;

const sampleRows = [];

for (let i = warmup; i < results.length; i++) {
  const ours = results[i].trend;
  const tv   = tvAt[i];
  if (isNaN(ours) || isNaN(tv) || tv === 0) continue;

  const absErr = Math.abs(ours - tv);
  const pctErr = (absErr / tv) * 100;
  sumAbsErr += absErr;
  sumPctErr += pctErr;
  validCount++;

  if (absErr > maxAbsErr) {
    maxAbsErr = absErr;
    maxErrIdx = i;
  }

  // Collect sample comparison rows (every ~200 bars)
  if (i % 200 === 0) {
    sampleRows.push({ i, time: candles[i].time, close: candles[i].close, ours: ours.toFixed(4), tv: tv.toFixed(4), pctErr: pctErr.toFixed(4) + '%' });
  }
}

const avgAbsErr = sumAbsErr / validCount;
const avgPctErr = sumPctErr / validCount;

console.log(`Valid comparison bars: ${validCount}`);
console.log(`Avg absolute error:    ${avgAbsErr.toFixed(6)}`);
console.log(`Avg % error:           ${avgPctErr.toFixed(4)}%`);
console.log(`Max absolute error:    ${maxAbsErr.toFixed(6)} at bar ${maxErrIdx}`);
if (maxErrIdx >= 0) {
  console.log(`  → close=${candles[maxErrIdx].close}, ours=${results[maxErrIdx].trend?.toFixed(4)}, tv=${tvAt[maxErrIdx]?.toFixed(4)}`);
}
console.log('');

console.log('Sample comparisons (every ~200 bars):');
console.table(sampleRows);
console.log('');

// ── Compare Micro Trend signals ───────────────────────────────────────────────
console.log('=== MICRO TREND SIGNAL COMPARISON ===');
let bullMatch = 0, bearMatch = 0, bullTotal = 0, bearTotal = 0;

for (let i = warmup; i < results.length; i++) {
  if (tvMicroBull[i]) {
    bullTotal++;
    if (results[i].microBull) bullMatch++;
  }
  if (tvMicroBear[i]) {
    bearTotal++;
    if (results[i].microBear) bearMatch++;
  }
}

console.log(`Bullish Micro Trend match: ${bullMatch}/${bullTotal} (${bullTotal ? ((bullMatch/bullTotal)*100).toFixed(1) : 'N/A'}%)`);
console.log(`Bearish Micro Trend match: ${bearMatch}/${bearTotal} (${bearTotal ? ((bearMatch/bearTotal)*100).toFixed(1) : 'N/A'}%)`);
console.log('');

// ── Direction check (are we at least on the right side?) ─────────────────────
console.log('=== DIRECTION AGREEMENT ===');
let dirAgree = 0, dirTotal = 0;
for (let i = warmup + 1; i < results.length; i++) {
  const tv   = tvAt[i];
  const tvPrev = tvAt[i - 1];
  const ours = results[i].trend;
  const oursPrev = results[i - 1].trend;
  if (isNaN(tv) || isNaN(tvPrev) || isNaN(ours) || isNaN(oursPrev)) continue;
  const tvUp   = tv   >= tvPrev;
  const oursUp = ours >= oursPrev;
  if (tvUp === oursUp) dirAgree++;
  dirTotal++;
}
console.log(`AT line slope direction match: ${dirAgree}/${dirTotal} (${dirTotal ? ((dirAgree/dirTotal)*100).toFixed(1) : 'N/A'}%)`);
console.log('');

// ── Re-run with MFI if results are poor — reminder ────────────────────────────
if (avgPctErr > 2) {
  console.log('⚠️  Avg error > 2% — indicator likely uses MFI (needs volume data).');
  console.log('   Try re-exporting chart with volume visible, or share result with Saph.');
} else {
  console.log('✅ Avg error < 2% — formula is tracking well.');
}
