/**
 * validate-htf.js
 * Compares our htfLtfSuite implementation against TradingView exported values.
 *
 * Usage (from repo root):
 *   node trading/indicators/validate-htf.js
 *
 * Expects: htf-daily-export.csv in repo root
 * CSV columns:
 *   [0]  time
 *   [1]  open
 *   [2]  high
 *   [3]  low
 *   [4]  close
 *   [5]  TD8 buy warning  (1 when fired)
 *   [6]  TD8 sell warning (1 when fired)
 *   [7]  TD9 buy signal   (1 when fired)
 *   [8]  TD9 sell signal  (1 when fired)
 *   [9]  Small Bull Arrow (potential bull breakout)
 *   [10] Small Bear Arrow (potential bear breakout)
 *   [11] Big Bull Arrow   (confirmed bull breakout)
 *   [12] Big Bear Arrow   (confirmed bear breakout)
 *   [13] Over-Bought      (BB upper band value)
 *   [14] Over-Sold        (BB lower band value)
 *   [15] Caution          (likely squeeze ON)
 *   [16] Danger           (likely squeeze release)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { htfLtfSuite } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath   = path.resolve(__dirname, '../../htf-daily-export.csv');

// ── Parse CSV ──────────────────────────────────────────────────────────────────
const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
console.log('Columns:', lines[0]);
console.log('Total rows:', lines.length - 1, '\n');

const candles      = [];
const tv = { td8buy:[], td8sell:[], td9buy:[], td9sell:[],
             smallBull:[], smallBear:[], bigBull:[], bigBear:[],
             ob:[], os:[], caution:[], danger:[] };

for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(',');
  if (c.length < 15) continue;
  const time  = parseInt(c[0]);
  const open  = parseFloat(c[1]);
  const high  = parseFloat(c[2]);
  const low   = parseFloat(c[3]);
  const close = parseFloat(c[4]);
  if (isNaN(close)) continue;

  candles.push({ time, open, high, low, close, volume: 1 });
  tv.td8buy.push(parseFloat(c[5])  === 1);
  tv.td8sell.push(parseFloat(c[6]) === 1);
  tv.td9buy.push(parseFloat(c[7])  === 1);
  tv.td9sell.push(parseFloat(c[8]) === 1);
  tv.smallBull.push(parseFloat(c[9])  === 1);
  tv.smallBear.push(parseFloat(c[10]) === 1);
  tv.bigBull.push(parseFloat(c[11])  === 1);
  tv.bigBear.push(parseFloat(c[12])  === 1);
  tv.ob.push(parseFloat(c[13]));
  tv.os.push(parseFloat(c[14]));
  tv.caution.push(c[15]?.trim());
  tv.danger.push(c[16]?.trim());
}

const results = htfLtfSuite(candles);
const warmup  = 60;
const n       = results.length;

// ── Helper ────────────────────────────────────────────────────────────────────
function signalMatch(ourArr, tvArr, label) {
  let match = 0, tvTotal = 0, ourTotal = 0;
  for (let i = warmup; i < n; i++) {
    if (tvArr[i]) tvTotal++;
    if (ourArr[i]) ourTotal++;
    if (tvArr[i] && ourArr[i]) match++;
  }
  const recall    = tvTotal  ? ((match / tvTotal)  * 100).toFixed(1) : 'N/A';
  const precision = ourTotal ? ((match / ourTotal) * 100).toFixed(1) : 'N/A';
  console.log(`${label}:`);
  console.log(`  TV fired: ${tvTotal}, Ours fired: ${ourTotal}, Both: ${match}`);
  console.log(`  Recall (caught TV signals): ${recall}%`);
  console.log(`  Precision (our signals correct): ${precision}%`);
}

function bandMatch(ourBandFn, tvBandArr, label) {
  let sumPctErr = 0, count = 0, maxErr = 0, maxIdx = -1;
  for (let i = warmup; i < n; i++) {
    const tv  = tvBandArr[i];
    const our = ourBandFn(i);
    if (isNaN(tv) || isNaN(our) || tv === 0) continue;
    const pct = Math.abs(our - tv) / tv * 100;
    sumPctErr += pct;
    count++;
    if (pct > maxErr) { maxErr = pct; maxIdx = i; }
  }
  const avg = count ? (sumPctErr / count).toFixed(3) : 'N/A';
  console.log(`${label}: avg error ${avg}%, max ${maxErr.toFixed(3)}% at bar ${maxIdx}`);
}

// ── TD8 / TD9 signals ─────────────────────────────────────────────────────────
console.log('=== TD8 / TD9 SIGNALS ===');
signalMatch(results.map(r => r.td9Signal === 'buyWarning'),  tv.td8buy,  'TD8 Buy Warning');
signalMatch(results.map(r => r.td9Signal === 'sellWarning'), tv.td8sell, 'TD8 Sell Warning');
signalMatch(results.map(r => r.td9Signal === 'buySignal'),   tv.td9buy,  'TD9 Buy Signal');
signalMatch(results.map(r => r.td9Signal === 'sellSignal'),  tv.td9sell, 'TD9 Sell Signal');
console.log('');

// ── Breakout arrows ───────────────────────────────────────────────────────────
console.log('=== BREAKOUT ARROWS ===');
signalMatch(results.map(r => r.potentialArrow === 'bull'), tv.smallBull, 'Small Bull (Potential)');
signalMatch(results.map(r => r.potentialArrow === 'bear'), tv.smallBear, 'Small Bear (Potential)');
signalMatch(results.map(r => r.confirmedArrow === 'bull'), tv.bigBull,   'Big Bull (Confirmed)');
signalMatch(results.map(r => r.confirmedArrow === 'bear'), tv.bigBear,   'Big Bear (Confirmed)');
console.log('');

// ── BB bands (Over-Bought / Over-Sold) ────────────────────────────────────────
console.log('=== BB BANDS (Over-Bought / Over-Sold) ===');
// Build our BB bands inline for comparison
import { sma, stdev } from './utils.js';
const closes   = candles.map(c => c.close);
const bbBasis  = sma(closes, 20);
const bbSd     = stdev(closes, 20);
const bbUpper  = bbBasis.map((b, i) => b + 2.0 * (bbSd[i] || 0));
const bbLower  = bbBasis.map((b, i) => b - 2.0 * (bbSd[i] || 0));
bandMatch(i => bbUpper[i], tv.ob, 'BB Upper (Over-Bought)');
bandMatch(i => bbLower[i], tv.os, 'BB Lower (Over-Sold)');
console.log('');

// ── Caution / Danger — identify what these are ────────────────────────────────
console.log('=== CAUTION / DANGER COLUMNS ===');
const cautionSamples = tv.caution.map((v, i) => v ? { i, v, close: candles[i]?.close } : null).filter(Boolean).slice(0, 10);
const dangerSamples  = tv.danger.map((v, i) => v ? { i, v, close: candles[i]?.close } : null).filter(Boolean).slice(0, 10);
console.log('Caution samples (first 10 non-empty):', cautionSamples);
console.log('Danger samples  (first 10 non-empty):', dangerSamples);
console.log('');

// ── Squeeze state — check against Caution/Danger if those are squeeze columns ─
console.log('=== SQUEEZE STATE ===');
const ourSqueezeOn  = results.map(r => r.squeezeOn);
const cautionBool   = tv.caution.map(v => !!v);
const dangerBool    = tv.danger.map(v => !!v);
signalMatch(ourSqueezeOn,                    cautionBool, 'Squeeze ON vs Caution');
signalMatch(ourSqueezeOn.map((v,i) => !v && i > 0 && ourSqueezeOn[i-1]), dangerBool, 'Squeeze Release vs Danger');

// ── Sample comparison table ───────────────────────────────────────────────────
console.log('\n=== SAMPLE ROWS (every 300 bars) ===');
const sample = [];
for (let i = warmup; i < n; i += 300) {
  sample.push({
    i,
    close: candles[i].close,
    ourSqueeze: results[i].squeezeOn,
    ourMom: results[i].momentum?.toFixed(2),
    ourTD9: results[i].td9Signal,
    tvOB: tv.ob[i]?.toFixed(2),
    ourBBU: bbUpper[i]?.toFixed(2),
  });
}
console.table(sample);
