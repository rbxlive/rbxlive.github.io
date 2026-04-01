/**
 * orchestrator.js — Phoenix Clipping Agent
 * Full pipeline runner: scout trends → match campaigns → clip → Telegram recap.
 * Enforces daily clip limits. Run once daily (cron or manual).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { scout } from './trend-scout.js';
import { monitorCampaigns } from './campaign-monitor.js';
import { processClip } from './clip-engine.js';
import TelegramBot from 'node-telegram-bot-api';

const config = JSON.parse(readFileSync('./config.json', 'utf8'));
const { dailyClips } = config.limits;
const { botToken, chatId } = config.telegram;

const STATE_FILE = './state.json';

// ── State management (tracks daily usage) ────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_FILE)) return { date: '', clipsToday: 0, log: [] };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { date: '', clipsToday: 0, log: [] };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function resetIfNewDay(state) {
  const today = todayStr();
  if (state.date !== today) {
    return { date: today, clipsToday: 0, log: [] };
  }
  return state;
}

// ── Telegram notifications ────────────────────────────────────────────────────

let bot;
function getBot() {
  if (!bot) bot = new TelegramBot(botToken);
  return bot;
}

async function notify(message) {
  try {
    await getBot().sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[orchestrator] Telegram send failed:', err.message);
  }
}

// ── Campaign matching ─────────────────────────────────────────────────────────

function matchCampaignsToNiche(campaigns, niche) {
  const nicheKeywords = niche.toLowerCase().split(' ');
  return campaigns.filter((c) => {
    const titleLower = (c.title || '').toLowerCase();
    return nicheKeywords.some((kw) => titleLower.includes(kw)) || c.cpm >= 1.5;
  });
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🦞 Phoenix Clipping Agent starting…\n');

  let state = loadState();
  state = resetIfNewDay(state);

  if (state.clipsToday >= dailyClips) {
    console.log(`[orchestrator] Daily limit reached (${dailyClips} clips). Exiting.`);
    return;
  }

  const remaining = dailyClips - state.clipsToday;
  console.log(`[orchestrator] Daily budget: ${state.clipsToday}/${dailyClips} used, ${remaining} remaining.`);

  // Step 1: Scout trending videos
  let candidates;
  try {
    candidates = await scout();
  } catch (err) {
    console.error('[orchestrator] Scout failed:', err.message);
    await notify(`⚠️ *Clipping Agent* — Scout step failed: ${err.message}`);
    return;
  }

  if (!candidates.length) {
    console.log('[orchestrator] No viral candidates found today.');
    await notify('📊 *Clipping Agent* — No viral candidates found above threshold today.');
    return;
  }

  // Step 2: Monitor campaigns
  let campaigns;
  try {
    campaigns = await monitorCampaigns();
  } catch (err) {
    console.warn('[orchestrator] Campaign monitor failed, continuing without campaign data:', err.message);
    campaigns = [];
  }

  console.log(`[orchestrator] ${candidates.length} candidates, ${campaigns.length} active campaigns.`);

  // Step 3: Process clips up to daily limit
  const results = [];
  const toProcess = candidates.slice(0, remaining);

  for (const candidate of toProcess) {
    if (state.clipsToday >= dailyClips) break;

    const matched = matchCampaignsToNiche(campaigns, candidate.niche);
    const bestCampaign = matched[0] || null;

    console.log(`\n[orchestrator] Processing: "${candidate.title}" (score: ${candidate.viralScore})`);
    if (bestCampaign) {
      console.log(`[orchestrator] Matched campaign: ${bestCampaign.platform} @ $${bestCampaign.cpm} CPM`);
    }

    const result = await processClip(candidate);
    if (!result) continue;

    state.clipsToday++;
    const logEntry = {
      videoId: candidate.videoId,
      title: candidate.title,
      viralScore: candidate.viralScore,
      niche: candidate.niche,
      campaign: bestCampaign ? { platform: bestCampaign.platform, cpm: bestCampaign.cpm } : null,
      outputPath: result.outputPath,
      timestamp: new Date().toISOString(),
    };
    state.log.push(logEntry);
    results.push(logEntry);

    saveState(state);
  }

  // Step 4: Telegram recap
  await sendRecap(results, campaigns, candidates.length);

  console.log(`\n[orchestrator] Done. ${results.length} clips produced today (${state.clipsToday}/${dailyClips} total).`);
}

async function sendRecap(results, campaigns, totalCandidates) {
  if (!botToken || !chatId) return;

  const lines = [
    `🦞 *Phoenix Clipping Agent — Daily Recap*`,
    `📅 ${todayStr()}`,
    ``,
    `📊 *Scouted:* ${totalCandidates} viral candidates`,
    `💼 *Active campaigns:* ${campaigns.length}`,
    `🎬 *Clips produced:* ${results.length}`,
    ``,
  ];

  if (results.length === 0) {
    lines.push('_No clips produced this run._');
  } else {
    lines.push('*Top clips:*');
    for (const r of results.slice(0, 5)) {
      const campaignStr = r.campaign ? ` → ${r.campaign.platform} $${r.campaign.cpm}/CPM` : ' → No campaign matched';
      lines.push(`• [${r.viralScore}] ${r.title.slice(0, 50)}${campaignStr}`);
    }
  }

  if (campaigns.length > 0) {
    lines.push('');
    lines.push('*Best campaigns right now:*');
    for (const c of campaigns.slice(0, 3)) {
      lines.push(`• ${c.platform} — $${c.cpm} CPM — ${c.title?.slice(0, 40) || 'Untitled'}`);
    }
  }

  await notify(lines.join('\n'));
}

// ── Entry point ───────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error('[orchestrator] Fatal error:', err);
  process.exit(1);
});
