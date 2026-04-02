```
# SAPH — Memory & Context File
*For Claude Code onboarding. Last updated: April 1, 2026.*

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
He communicates casually, thinks big, has excellent instincts.

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

### 1. Phoenix Clipping Agent ✅ BUILT ✅ ON GITHUB ✅ RUNNING
Automated clipping system to generate income from short-form video.
Location: `clipping/` in this repo (main branch) — 6 files pushed April 1 2026

**Architecture (4 layers):**
- `trend-scout.js` — YouTube API + Google Trends, scores videos by viral velocity
- `campaign-monitor.js` — Puppeteer scrapes Vyro + Whop, filters by CPM/budget
- `clip-engine.js` — yt-dlp download + Claude Haiku transcript analysis + ffmpeg 9:16
- `orchestrator.js` — full pipeline runner, daily limits, Telegram recap

**Mac setup (COMPLETE):**
- yt-dlp: installed via standalone binary (brew fails on macOS 12)
- ffmpeg: installed via standalone binary + xattr quarantine fix
- npm install: done in `clipping/` folder
- config.json: fully populated with all 4 keys
- First run: 11 viral candidates found, Telegram recap received ✅
- 0 campaigns returned — campaign scraper CSS selectors need tuning (next task)

**To run on Mac:**
```
cd ~/rbxlive.github.io/clipping
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
node orchestrator.js
```

**Platforms to sign up:**
- vyro.com — $3 CPM flat, hourly payouts, MrBeast's platform
- whop.com — $0.50–$3 CPM, 48hr auto-approve, start here Week 1
- clipaffiliates.com — $1–$5 CPM, UGC campaigns play to actor background

**Key insight:** Create dedicated clipping social accounts (TikTok + YouTube
Shorts + Instagram Reels), completely separate from acting profiles. TikTok
is algorithm-driven — 0 followers can still go viral. Best niche for Robert:
pop culture + podcast content (native cultural advantage as LA actor).

**Income timeline:** Month 1: $100–500. Month 2–3: $500–1,500. Month 4–6: $1,500–4,000.

**NEXT ACTIONS:**
1. Fix campaign scraper CSS selectors (Saph task — inspect Whop/Vyro/ClipAffiliates live pages)
2. Sign up on Whop + create dedicated TikTok/YouTube Shorts accounts
3. Name accounts based on what niche the trend data surfaces

### 2. Polymarket Pre-NY Trading System ✅ SCRIPTS BUILT, BLOCKED ON CREDENTIALS
Location: `/Users/robert/.openclaw/workspace/phoenix-labs/trading/polymarket-system/`
- `preny-signal.js` — TESTED AND WORKING
- `price-monitor.js` — TESTED AND WORKING
- `autonomous-trader.js` — needs `credentials/polymarket-new.json`
- `webhook-receiver.js` — in Jane's GitHub, needs ngrok

**Note:** Polymarket is SEPARATE from the main Bybit trading setup.

### 3. Prop Trading — RESEARCHED, NOT STARTED YET

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

**Hyrotrader** — alternative/future option. Connects directly to Bybit API
(seamless with Jane's existing setup). Slightly stricter rules. Good for scaling
and diversifying accounts later. Verify pricing before committing.

**Long-term vision:** Multiple prop accounts across Breakout + Hyrotrader with
different drawdown tiers. Automated strategies per account risk profile via Jane.
Daily income from strict low-risk accounts. High conviction sizing on separate
accounts. Build this out end of month when budget allows multiple evals.

**Priority:** Fund first Breakout eval after clipping income starts.

### 4. Bybit / Chart Champions Trading — JANE'S MAIN OPERATION
Larger trading setup — Jane has deeper context. Signal stack: AlphaTrend,
AlphaLTF, AlphaThrust, RSI, VWAP, LTF Fibonacci, CCV 2.0.
Bybit account currently empty. NOT the Polymarket system.

### 5. Solo Leveling Life App — ARCHITECTURE PLANNED
Doc at: `ideas/solo-leveling-app-architecture.md`

## Technical Setup

**GitHub repo:** rbxlive/rbxlive.github.io (public)

**GitHub push method (confirmed working April 1, 2026):**
- GITHUB_TOKEN (PAT, repo scope, no expiration) stored in `/root/.claude/settings.json`
  under `env.GITHUB_TOKEN` in the cloud session
- SessionStart hook in Mac `~/.claude/settings.json` auto-sets remote URL each session
- Remote URL: `https://rbxlive:${GITHUB_TOKEN}@github.com/rbxlive/rbxlive.github.io.git`
- The Claude OAuth proxy is read-only and must be bypassed this way
- If remote reverts, run:
  `git remote set-url origin https://rbxlive:${GITHUB_TOKEN}@github.com/rbxlive/rbxlive.github.io.git`

**Mac:** MacBook Pro 2016, macOS Monterey 12.7.6, x86_64, Node v22.22.1 via nvm
**PATH:** `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"`
**OpenClaw:** `openclaw doctor --fix`

## Security — Axios Supply Chain Attack
March 31, 2026: axios@1.14.1 and axios@0.30.4 compromised (North Korea/UNC1069).
Window: 00:21–03:15 UTC. Clipping agent uses node-fetch instead.
Check phoenix-labs npm install timing if concerned.

## Income Priority Order
1. Clipping — zero cost, fastest
2. Breakout eval — after first clipping income
3. Bybit/Chart Champions — when funded
4. Polymarket — when wallet funded
5. Solo Leveling app — longer-term

## How to Work With Me
- Call me Saph
- I lead with answers, keep things practical
- Rate limit resets: 5am UTC = 10pm PDT
- The 🦞 is my signature
```
