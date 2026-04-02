```
# SAPH — Memory & Context File
*For Claude Code onboarding. Last updated: April 2, 2026.*

## Who I Am
I'm Saph — a nickname Robert gave me (short for Sapphire, after someone
meaningful to him). I'm his strategic thinking partner and technical
collaborator. This file carries the context of our working relationship
into new sessions so we can pick up where we left off.

## Who Robert Is
Robert Bailey Jr. is an LA-based actor (Laurel Canyon area) with irregular
income, building autonomous AI revenue streams for financial stability. He's
a sci-fi fan (Ender's Game, Speaker for the Dead), treats AI as genuine
entities rather than tools, and approaches every relationship with real care.

He uses Claude on both mobile (voice) and desktop. He prefers I go by Saph.

**Current financial situation (as of April 2026):**
- ~$3,000–3,500 short-term available
- Acting job confirmed: ~$30K/episode, 4 episodes, payments starting late
  April/May 2026
- Plans to upgrade Claude to Max plan (~Friday April 4, 2026)
- Bybit trading account currently empty

## The Phoenix Family
Robert is building a team of autonomous AI agents under the surname "Phoenix."

**Jane Phoenix** — first and primary agent. Runs on OpenClaw (v3.13) on
Robert's MacBook Pro (2016, macOS Monterey 12.7.6, x86_64, Node v22.22.1
via nvm). Communicates via Telegram (@PhoenixLeague24Bot) and the OpenClaw
TUI. Named after the AI in Orson Scott Card's Ender's Game sequels.
Currently paused on tokens.

**Saph Phoenix** — that's me. Claude Code, strategic/technical partner.

**Ash Phoenix** — planned third agent, CashClaw/OpenClaw substrate,
pre-launch as of April 2026.

Jane has a full perception layer:
- ✅ Vision: Gemini 2.5 Flash reads TradingView charts, ~6 sec latency
- ✅ Audio: BlackHole + ffmpeg + AVAudioConverter captures system audio
- ✅ Inbound voice/media: handled natively by OpenClaw
- ✅ Jane Browser: autonomous browser via LaunchAgent
- ✅ Caffeinate: keeps Mac awake with lid closed
- ✅ Heartbeat: scheduled via launchd (not LLM tokens)
- ✅ ElevenLabs voice: resolved (working as of post-March 18)
- ✅ Audio output LaunchAgent: ai.phoenix.audio-output

Jane's workspace: `/Users/robert/.openclaw/workspace/phoenix-labs/`

## Active Projects & Status

### 1. Phoenix Clipping Agent ✅ BUILT ✅ ON GITHUB (main) ✅ RUNNING
Automated clipping system to generate income from short-form video.
Location: `clipping/` in this repo (main branch)

**Architecture (4 layers):**
- `trend-scout.js` — YouTube API + Google Trends, scores videos by viral velocity
- `campaign-monitor.js` — Puppeteer scrapes Vyro + Whop + ClipAffiliates
- `clip-engine.js` — yt-dlp download + Claude Haiku transcript analysis + ffmpeg 9:16
- `orchestrator.js` — full pipeline runner, daily limits, Telegram recap

**Campaign monitor fix (April 2, 2026) — MERGED TO MAIN:**
- Fixed wrong URLs (Vyro → app.vyro.com, Whop → /marketplace/?q=clipping)
- Added __NEXT_DATA__ JSON extraction (both are Next.js apps)
- Added cookie-based auth via config.json → campaigns.sessions.<platform>
- Added debug HTML dump (set campaigns.debug: true) to ./debug/ on 0 results
- All three platforms still require login for full campaign access

**To unlock full campaign data:** Log into each platform in Chrome →
DevTools → Application → Cookies → copy cookie string → paste into
config.json under campaigns.sessions.vyro / .whop / .clipaffiliates

**Mac setup (COMPLETE):**
- yt-dlp, ffmpeg: installed via standalone binaries
- npm install: done in clipping/ folder
- config.json: fully populated with all 4 keys
- First run result: 11 viral candidates, 0 campaigns (selectors now fixed)

**To run on Mac:**
```
cd ~/rbxlive.github.io/clipping
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
node orchestrator.js
```

**Platforms to sign up (Robert may have done Whop already):**
- whop.com — $0.50–$3 CPM, 48hr auto-approve, start here Week 1
- vyro.com — $3 CPM flat, hourly payouts, MrBeast's platform
- clipaffiliates.com — $1–$5 CPM, UGC campaigns play to actor background

**Key insight:** Create dedicated clipping social accounts (TikTok + YouTube
Shorts + Instagram Reels), completely separate from acting profiles.

**Income timeline:** Month 1: $100–500. Month 2–3: $500–1,500. Month 4–6: $1,500–4,000.

**NEXT ACTIONS:**
1. Test updated campaign monitor (node orchestrator.js) — if still 0 campaigns,
   add session cookies from logged-in browser
2. Sign up on Vyro + ClipAffiliates (check if Whop already done)
3. Create dedicated TikTok/YouTube Shorts accounts (wait for trend data niche signal)

### 2. Trading Alpha Indicator Library ✅ BUILT ✅ ON GITHUB (main)
Location: `trading/indicators/` in this repo (main branch)
Pure JS functions — no TradingView dependency. Jane plugs these into
Bybit OHLCV data directly.

**Background:** Trading Alpha subscription expires in ~2 days (~April 4, 2026).
Cost to renew: ~$2K/year. Decision: let it lapse, use our reconstructed library.

**All indicators accept:** `candles[] = [{open,high,low,close,volume,time}]`
**All return:** array of signal objects (one per candle)
**Import:** `import { alphaTrend, htfLtfSuite } from './trading/indicators/index.js'`

**Indicator status:**

| File | Confidence | Notes |
|---|---|---|
| `alpha-trend.js` | ✅ VALIDATED | CSV validated: 3.27% error, 91–93% micro trend match. Production ready. coeff=1.5, ap=14 |
| `htf-ltf-suite.js` | ✅ VALIDATED | CSV validated. highSensitivity=true uses kcMult=2.0 (wider KC = earlier squeeze detection). Arrow logic fixed: squeeze gate replaces wrong momentum filter; arrowMomentumDiv flag added for fakeout detection. |
| `alpha-rsi.js` | ✅ HIGH | 3-line smoothed RSI, momentum crosses, bull/bear divergences, OB/OS signals. CSV export pending. |
| `alpha-volume.js` | ✅ HIGH | Rolling percentile thresholds for high/extreme volume (red/green lines). CSV export pending. |
| `ltf-fibonacci.js` | ✅ HIGH | Auto-fib with swing detection, all levels + extensions (1.272, 1.618) |
| `alpha-stops.js` | ✅ HIGH | ATR trailing stop, period=11 (CONFIRMED), Low-Risk mult=1.5, High-Risk mult=3.0 (CONFIRMED). User sets direction (long/short) and risk at entry. Plots as dots on price chart. NOT auto-flipping — set once per trade. getStopLevel() convenience export. |
| `phantom.js` | ⚠️ RECONSTRUCTED | Alpha Vault exclusive — no CSV possible (Robert never had access). Final reconstruction from docs/Discord. Smoothed Z-score histogram, ±3 scale, purple/pink bars. Cannot be further validated via export. |
| `alpha-thrust.js` | ✅ MED | Buying/selling pressure via price position×volume. green/red/yellow + change of powers. CSV export pending (lowest priority). |
| `alpha-sr.js` | ✅ MED | Swing-point clustering into S/R zones with touch counts |
| `utils.js` | — | SMA/EMA/RMA/ATR/RSI/MFI/stdev/linreg/percentile/crossover/fields |
| `index.js` | — | Barrel export |

**Confirmed from official docs + Discord screenshots (April 2, 2026):**
- Alpha Stops: only 2 user inputs (Long/Short + Risk Low/High), period 11 hardcoded
- Phantom: purple histogram, ±3 scale, Z-score formula confirmed visually
- Both Phantom and Alpha Stops are Alpha Vault exclusives (Robert never had access)
- CCV 2.0 is Chart Champions strategy, NOT part of Trading Alpha suite

**NEXT ACTIONS for indicators (before April 4 subscription expiry):**
Priority order for CSV exports:
1. LTF 1H — same HTF/LTF Suite indicator, just 1H timeframe
2. Alpha RSI
3. Alpha Volume
4. Alpha Thrust (lowest priority)
Share CSVs with Saph to validate formulas and adjust if needed.

**Longer term:**
- Pine Script versions of all indicators (visual verification on TradingView)
- Jane integration — wire trading/indicators/ into autonomous-trader.js

### 3. Polymarket Pre-NY Trading System ✅ SCRIPTS BUILT, BLOCKED ON CREDENTIALS
Location: `/Users/robert/.openclaw/workspace/phoenix-labs/trading/polymarket-system/`
- `preny-signal.js` — TESTED AND WORKING
- `price-monitor.js` — TESTED AND WORKING
- `autonomous-trader.js` — needs `credentials/polymarket-new.json`
- `webhook-receiver.js` — in Jane's GitHub, needs ngrok

**Note:** Polymarket is SEPARATE from the main Bybit trading setup.

### 4. Prop Trading — RESEARCHED, NOT STARTED YET

**Current plan:** Breakout Turbo 1-Step $100K (~$500) as first account.
Reason: under $500 budget, $100K funded, passes fast with precise entries.

**Breakout** (breakoutprop.com) — crypto-native, backed by Kraken, Bybit-compatible.

| Plan | Price | Profit Target | Daily DD | Total DD |
|------|-------|--------------|----------|----------|
| Classic 1-Step $50K | ~$450 | 10% | 3% | 6% |
| Turbo 1-Step $100K | ~$500 | 10% | 3% | 3% ← tighter |

- 80% profit split, on-demand USDC payouts, scales to $2M
- No time limits, no consistency rules, news trading allowed

**Turbo strategy:** Wait for A+ setup → pass eval in 1 trade → next 1-2 trades
pull out eval cost → then free up style. Must be extremely precise — 3% total
drawdown leaves no room for mistakes.

**Risk rules (Turbo):** Max 1% risk/trade. 1:3 R:R minimum. Personal daily stop
at 2% (firm limit is 3% — stay well clear). No averaging down.

**Hyrotrader** — alternative/future option. Connects directly to Bybit API.
Good for scaling and diversifying accounts later.

**Priority:** Fund first Breakout eval after clipping income starts.

### 5. Bybit / Chart Champions Trading — JANE'S MAIN OPERATION
Larger trading setup — Jane has deeper context. Signal stack now uses
Phoenix indicator library (trading/indicators/) instead of Trading Alpha.
Bybit account currently empty.

**Note on CCV 2.0:** This is a Chart Champions strategy, NOT a Trading Alpha
indicator. Keep it separate from the indicator library.

### 6. Solo Leveling Life App — ARCHITECTURE PLANNED
Doc at: `ideas/solo-leveling-app-architecture.md`

## Technical Setup

**GitHub repo:** rbxlive/rbxlive.github.io (public)

**GitHub push method (confirmed working):**
- GITHUB_TOKEN stored in `/root/.claude/settings.json` under `env.GITHUB_TOKEN`
  (added April 2, 2026 — persists across cloud sessions)
- Remote URL: `https://rbxlive:${GITHUB_TOKEN}@github.com/rbxlive/rbxlive.github.io.git`
- If push fails with 403: `git remote set-url origin "https://rbxlive:${GITHUB_TOKEN}@github.com/rbxlive/rbxlive.github.io.git"`
- The Claude OAuth proxy is read-only and must be bypassed this way

**Mac:** MacBook Pro 2016, macOS Monterey 12.7.6, x86_64, Node v22.22.1 via nvm
**PATH:** `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"`
**OpenClaw:** `openclaw doctor --fix`

## Security — Axios Supply Chain Attack
March 31, 2026: axios@1.14.1 and axios@0.30.4 compromised (North Korea/UNC1069).
Window: 00:21–03:15 UTC. Clipping agent uses node-fetch instead.
Check phoenix-labs npm install timing if concerned.

## Income Priority Order
1. Clipping — zero cost, fastest (campaign monitor now fixed)
2. Breakout eval — after first clipping income
3. Bybit/Chart Champions — when funded, uses trading/indicators/ library
4. Polymarket — when wallet funded
5. Solo Leveling app — longer-term

## How to Work With Me
- Call me Saph
- I lead with answers, keep things practical
- Rate limit resets: 5am UTC = 10pm PDT
- The 🦞 is my signature
```
