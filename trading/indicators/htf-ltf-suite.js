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
 * 3. BREAKOUT ARROWS (confirmed from Trading Alpha docs, April 2026)
 *    Small (potential) arrows: appear DURING the squeeze when momentum supports direction.
 *                              Lower probability. For aggressive early entries.
 *    Large (confirmed) arrows: appear AT squeeze release. Higher probability.
 *                              For conservative, high-probability entries.
 *    Current implementation uses BB band crossover + momentum as a PROXY for squeeze
 *    release (empirically 79-89% match vs TV). True squeeze-based logic requires
 *    resolving the "high sensitivity" KC parameter — TODO.
 *
 * CAUTION/DANGER X SIGNALS (HTF Premium only — NOT on LTF Suite)
 *    Yellow X = Caution: first leg of squeeze breakout is nearing its end
 *    Red X    = Danger:  first leg of squeeze breakout IS over
 *    Always fire as a pair (one Caution + one Danger per squeeze period, 1-2 bars apart).
 *    Count matches squeeze period count exactly.
 *    Use case: risk management — de-risk or take profit after squeeze breakout.
 *    Also useful for identifying dead-cat bounces after support breaks.
 *    Exact formula unknown (likely ATR-based target or momentum peak detection).
 *    NOT currently implemented — marked as TODO.
 *    Reference CSV columns: "Caution" (col 15), "Danger" (col 16) in TV export.
 *
 * 5. SQUEEZE FAKEOUT (composite signal — requires AlphaTrend + HTF/LTF together)
 *    Definition: squeeze active/recently released + AlphaTrend reversalCandle prints
 *                → the breakout is FAKE, a violent reversal is incoming.
 *    This is one of the most powerful signals in the suite. Signaled 2021 BTC top ($63k)
 *    and 2021 BTC bottom ($29k, 60% return trade).
 *
 *    Two valid fakeout scenarios:
 *      a) Reversal bar DURING squeeze (squeezeOn && reversalCandle)
 *      b) Reversal bar AFTER squeeze breakout (within ~3 bars of squeeze release)
 *
 *    CONFIRMATION REQUIRED: fakeout is only valid when the bar AFTER the reversal bar
 *    closes in the reversal direction (below R bar for bearish, above for bullish).
 *    Same confirmation rules as standard AlphaTrend reversal bars.
 *
 *    Detection (Jane's signal layer):
 *      const recentSqueeze = squeezeOn[i] || squeezeOn[i-1] || squeezeOn[i-2] || squeezeOn[i-3];
 *      const fakeout = recentSqueeze && alphaTrendResult[i].reversalCandle;
 *      const fakeoutConfirmed = fakeout[i-1] && (bearish ? close[i] < close[i-1] : close[i] > close[i-1]);
 *    NOT computed inside this function — must be combined in Jane's signal layer.
 *
 * 5. MOMENTUM BARS (green / red bars on chart)
 *    Green bar: bullish momentum (often precedes white/uptrend bars).
 *    Red bar:   bearish momentum (often precedes grey/downtrend bars).
 *    Tip from docs: momentum bar color during squeeze gives confluence on breakout direction.
 *
 * 6. TREND BARS (white = uptrend, grey = downtrend)
 *    Determined by fast vs slow EMA relationship.
 *
 * 7. TD9 OVERBOUGHT / OVERSOLD (8/9 signals)
 *    Buy setup:  9 consecutive closes each BELOW the close 4 bars ago → bullish oversold.
 *    Sell setup: 9 consecutive closes each ABOVE the close 4 bars ago → bearish overbought.
 *    Signals print at count 8 (early warning) and 9 (full signal).
 *
 * HIGH SENSITIVITY (confirmed empirically, April 2026):
 *    Normal sensitivity:  kcMult=1.5 — standard TTM Squeeze compression threshold
 *    High sensitivity:    kcMult=2.0 — wider KC, BB fits inside earlier/more easily
 *    Effect: High detects squeezes earlier in the compression cycle AND detects squeezes
 *            that Normal misses entirely. Produces ~65% more arrows on BTC daily.
 *    How confirmed: TV exports compared; BB bands IDENTICAL between both modes (bbMult=2.0
 *    confirmed). Only KC changed. Arrow counts: 71 (high) vs 43 (normal). Robert confirmed
 *    "high sensitivity shows squeeze shading starting earlier."
 *
 * ARROW LOGIC (confirmed from TV CSV analysis, April 2026):
 *    Big arrows fire at EVERY BB band crossover that is preceded by a recent squeeze.
 *    Momentum is NOT required to align with arrow direction — arrows can fire against momentum.
 *    When momentum DISAGREES with arrow direction → likely a squeeze fakeout. Flag separately.
 *    Gate: squeezeOn must have been true within the last 15 bars for arrow to fire.
 *
 * Parameters:
 *   bbPeriod        {number} 20    — BB period (confirmed from TV CSV OB/OS exact match)
 *   bbMult          {number} 2.0   — BB std dev multiplier (confirmed from TV CSV)
 *   kcPeriod        {number} 20    — Keltner Channel period
 *   kcMult          {number} 1.5   — KC ATR multiplier (Normal sensitivity)
 *   highSensitivity {boolean} false — if true, uses kcMult=2.0 (wider KC, more squeezes)
 *   momShort        {number} 9     — Momentum delta period (CONFIRMED from TV settings)
 *   momLong         {number} 26    — Momentum linreg period (CONFIRMED from TV settings)
 *   fastEma         {number} 21    — Fast EMA for trend bars
 *   slowEma         {number} 55    — Slow EMA for trend bars
 *   arrowSqueezeWindow {number} 15 — bars to look back for recent squeeze when gating arrows
 */

import { sma, ema, atr, stdev, highest, lowest, linreg, fields } from './utils.js';

export function htfLtfSuite(candles, options = {}) {
  const {
    bbPeriod          = 20,
    bbMult            = 2.0,
    kcPeriod          = 20,
    kcMult            = 1.5,    // Normal sensitivity. High sensitivity uses 2.0.
    highSensitivity   = false,  // true → kcMult=2.0, detects squeezes earlier
    momShort          = 9,      // delta period — confirmed from TV settings
    momLong           = 26,     // linreg period — confirmed from TV settings
    fastEmaPer        = 21,
    slowEmaPer        = 55,
    arrowSqueezeWindow = 15,    // bars back to look for recent squeeze to gate arrows
  } = options;

  const effectiveKcMult = highSensitivity ? 2.0 : kcMult;

  const { highs, lows, closes, times } = fields(candles);
  const n = closes.length;

  // ── 1. Volatility Squeeze ──────────────────────────────────────────────────
  const bbBasis = sma(closes, bbPeriod);
  const bbSd    = stdev(closes, bbPeriod);
  const bbUpper = bbBasis.map((b, i) => b + bbMult * (bbSd[i] || 0));
  const bbLower = bbBasis.map((b, i) => b - bbMult * (bbSd[i] || 0));

  const atrVals = atr(highs, lows, closes, kcPeriod);
  const kcBasis = ema(closes, kcPeriod);
  const kcUpper = kcBasis.map((b, i) => b + effectiveKcMult * (atrVals[i] || 0));
  const kcLower = kcBasis.map((b, i) => b - effectiveKcMult * (atrVals[i] || 0));

  // Squeeze is ON when BB is inside KC (compressed volatility)
  const squeezeOn = bbUpper.map((u, i) =>
    !isNaN(u) && !isNaN(kcUpper[i]) && u < kcUpper[i] && bbLower[i] > kcLower[i]
  );

  // ── 2. Momentum Histogram ──────────────────────────────────────────────────
  // delta = close − midpoint(momShort): (highest + lowest + sma) / 3
  // momentum = linreg(delta, momLong)
  // momShort=9 (delta period), momLong=26 (linreg period) confirmed from TV settings panel
  const highN   = highest(highs, momShort);
  const lowN    = lowest(lows,   momShort);
  const smaMom  = sma(closes,    momShort);
  const delta = closes.map((c, i) =>
    isNaN(highN[i]) ? NaN : c - (highN[i] + lowN[i] + smaMom[i]) / 3
  );
  const momentum = linreg(delta, momLong);

  const momentumColor = momentum.map((m, i) => {
    if (isNaN(m)) return 'neutral';
    if (i === 0)  return m >= 0 ? 'brightGreen' : 'brightRed';
    const prev = momentum[i - 1];
    if (m >= 0) return m > prev ? 'brightGreen' : 'dimGreen';
    return m < prev ? 'brightRed' : 'dimRed';
  });

  // ── 3. Breakout Arrows (BB crossover signals) ─────────────────────────────
  // Confirmed from CSV analysis (April 2026, 3600 bars BTC daily):
  //   Big (confirmed) arrows = close crosses BB upper/lower band, gated by recent squeeze
  //   Small (potential) arrows = close crosses BB midline (SMA), gated by recent squeeze
  //
  // KEY FINDINGS (empirically derived):
  //   - 100% of big arrows occur at BB band crossovers (71/71 confirmed)
  //   - Only 30.5% of BB crossovers produce an arrow (70% filtered by squeeze gate)
  //   - Momentum does NOT need to agree with arrow direction — arrows fire against momentum
  //   - When momentum DISAGREES: mark as momentumDivergence=true (fakeout candidate)
  //     e.g. bull arrow + negative momentum = possible squeeze fakeout (BTC $63k top Nov 2021)
  //   - Squeeze gate: squeezeOn must be true within last arrowSqueezeWindow bars
  const potentialArrow = new Array(n).fill(null);   // small: 'bull' | 'bear' | null
  const confirmedArrow = new Array(n).fill(null);   // big:   'bull' | 'bear' | null
  const arrowMomentumDiv = new Array(n).fill(false); // true = arrow fires against momentum

  for (let i = 1; i < n; i++) {
    if (isNaN(bbUpper[i]) || isNaN(bbLower[i]) || isNaN(bbBasis[i])) continue;
    if (isNaN(bbUpper[i - 1]) || isNaN(bbLower[i - 1]) || isNaN(bbBasis[i - 1])) continue;

    // Squeeze gate: was squeezeOn true in the last arrowSqueezeWindow bars?
    let recentSqueeze = false;
    for (let j = Math.max(0, i - arrowSqueezeWindow); j <= i; j++) {
      if (squeezeOn[j]) { recentSqueeze = true; break; }
    }
    if (!recentSqueeze) continue;

    const bullBand = closes[i] > bbUpper[i]  && closes[i - 1] <= bbUpper[i - 1];
    const bearBand = closes[i] < bbLower[i]  && closes[i - 1] >= bbLower[i - 1];
    const bullMid  = closes[i] > bbBasis[i]  && closes[i - 1] <= bbBasis[i - 1];
    const bearMid  = closes[i] < bbBasis[i]  && closes[i - 1] >= bbBasis[i - 1];
    const momBull  = !isNaN(momentum[i]) && momentum[i] > 0;
    const momBear  = !isNaN(momentum[i]) && momentum[i] < 0;

    // Big arrows — BB band crossover, squeeze-gated (no momentum requirement)
    if (bullBand) {
      confirmedArrow[i] = 'bull';
      if (!momBull) arrowMomentumDiv[i] = true; // momentum divergence → fakeout candidate
    }
    if (bearBand) {
      confirmedArrow[i] = 'bear';
      if (!momBear) arrowMomentumDiv[i] = true;
    }

    // Small arrows — BB midline crossover, squeeze-gated
    if (bullMid && !bullBand) potentialArrow[i] = 'bull';  // only if didn't already fire big
    if (bearMid && !bearBand) potentialArrow[i] = 'bear';
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
    potentialArrow:    potentialArrow[i],    // 'bull' | 'bear' | null
    confirmedArrow:    confirmedArrow[i],    // 'bull' | 'bear' | null — highest probability
    arrowMomentumDiv:  arrowMomentumDiv[i],  // true = arrow fires against momentum (fakeout candidate)
    barColor:         barColor[i],         // 'white'|'green'|'grey'|'red'|'neutral'
    td9Count:         td9[i],              // raw count (+ve buy setup, -ve sell setup)
    td9Signal:        td9Signal[i],        // 'buyWarning'|'buySignal'|'sellWarning'|'sellSignal'|null
    fastEma:          fastEmaVals[i],
    slowEma:          slowEmaVals[i],
  }));
}
