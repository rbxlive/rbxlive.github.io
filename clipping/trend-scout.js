/**
 * trend-scout.js — Phoenix Clipping Agent
 * Discovers high-viral-velocity videos via YouTube Data API + Google Trends.
 * Returns scored candidates ranked by viral potential.
 */

import fetch from 'node-fetch';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config.json', 'utf8'));
const { apiKey } = config.youtube;

const NICHES = [
  'pop culture drama',
  'podcast highlights',
  'celebrity reaction',
  'movie trailer reaction',
  'sports highlights',
  'comedy clips',
  'viral moments 2026',
];

const SEARCH_PARAMS = {
  part: 'snippet',
  type: 'video',
  videoDuration: 'medium',        // 4–20 min source material
  videoDefinition: 'high',
  relevanceLanguage: 'en',
  regionCode: 'US',
  order: 'viewCount',
  publishedAfter: getIsoMinus(48), // last 48 hours
  maxResults: 10,
};

function getIsoMinus(hours) {
  const d = new Date(Date.now() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

async function fetchYouTubeSearch(query) {
  const params = new URLSearchParams({
    ...SEARCH_PARAMS,
    q: query,
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchVideoStats(videoIds) {
  const params = new URLSearchParams({
    part: 'statistics,snippet',
    id: videoIds.join(','),
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  if (!res.ok) throw new Error(`YouTube stats failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Viral velocity score: views-per-hour weighted by engagement ratio.
 * Score 0–100. Threshold configurable in config.json (limits.minViralScore).
 */
function scoreVideo(stats, publishedAt) {
  const views = parseInt(stats.viewCount || 0, 10);
  const likes = parseInt(stats.likeCount || 0, 10);
  const comments = parseInt(stats.commentCount || 0, 10);

  const ageHours = Math.max(
    (Date.now() - new Date(publishedAt).getTime()) / 3_600_000,
    0.5
  );

  const viewsPerHour = views / ageHours;
  const engagementRate = views > 0 ? (likes + comments) / views : 0;

  // Normalise: 10k views/hr = ~50 score, engagement multiplier up to 2x
  const base = Math.min((viewsPerHour / 10_000) * 50, 80);
  const bonus = Math.min(engagementRate * 200, 20);

  return Math.round(base + bonus);
}

async function scout() {
  console.log('[trend-scout] Starting scan across', NICHES.length, 'niches…');
  const candidates = [];

  for (const niche of NICHES) {
    let searchData;
    try {
      searchData = await fetchYouTubeSearch(niche);
    } catch (err) {
      console.error(`[trend-scout] Search failed for "${niche}":`, err.message);
      continue;
    }

    const videoIds = (searchData.items || []).map((i) => i.id.videoId).filter(Boolean);
    if (!videoIds.length) continue;

    let statsData;
    try {
      statsData = await fetchVideoStats(videoIds);
    } catch (err) {
      console.error(`[trend-scout] Stats failed for "${niche}":`, err.message);
      continue;
    }

    for (const video of statsData.items || []) {
      const score = scoreVideo(video.statistics, video.snippet.publishedAt);
      if (score < config.limits.minViralScore) continue;

      candidates.push({
        videoId: video.id,
        title: video.snippet.title,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        views: parseInt(video.statistics.viewCount || 0, 10),
        likes: parseInt(video.statistics.likeCount || 0, 10),
        viralScore: score,
        niche,
      });
    }

    // Respect YouTube quota — small delay between niche searches
    await new Promise((r) => setTimeout(r, 300));
  }

  // Sort by viral score descending
  candidates.sort((a, b) => b.viralScore - a.viralScore);

  console.log(`[trend-scout] Found ${candidates.length} candidates above score threshold.`);
  return candidates;
}

export { scout };
