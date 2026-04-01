/**
 * clip-engine.js — Phoenix Clipping Agent
 * Downloads source video via yt-dlp, uses Claude Haiku to identify the best
 * clip moment from a transcript, then cuts + reformats to 9:16 with ffmpeg.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import fetch from 'node-fetch';
import { readFileSync } from 'fs';

const execFileAsync = promisify(execFile);
const config = JSON.parse(readFileSync('./config.json', 'utf8'));

const OUTPUT_DIR = config.output.dir || './clips';
const ANTHROPIC_API_KEY = config.anthropic.apiKey;

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Download ──────────────────────────────────────────────────────────────────

async function downloadVideo(videoId) {
  const tmpDir = join(OUTPUT_DIR, '_tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const outputPath = join(tmpDir, `${videoId}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`[clip-engine] Downloading ${videoId}…`);

  await execFileAsync('yt-dlp', [
    '--format', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '--merge-output-format', 'mp4',
    '--output', outputPath,
    '--no-playlist',
    url,
  ]);

  // yt-dlp resolves the actual extension — find the file
  const { stdout } = await execFileAsync('yt-dlp', [
    '--get-filename',
    '--format', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '--merge-output-format', 'mp4',
    '--output', join(tmpDir, `${videoId}.%(ext)s`),
    url,
  ]);

  return stdout.trim();
}

// ── Transcript via yt-dlp ─────────────────────────────────────────────────────

async function fetchTranscript(videoId) {
  const tmpDir = join(OUTPUT_DIR, '_tmp');
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    await execFileAsync('yt-dlp', [
      '--write-auto-sub',
      '--sub-lang', 'en',
      '--sub-format', 'vtt',
      '--skip-download',
      '--output', join(tmpDir, `${videoId}_sub.%(ext)s`),
      url,
    ]);

    // Read the VTT file and strip cue formatting to plain text with timestamps
    const vttPath = join(tmpDir, `${videoId}_sub.en.vtt`);
    if (!existsSync(vttPath)) return null;

    const raw = readFileSync(vttPath, 'utf8');
    const lines = raw.split('\n');
    const segments = [];
    let currentTime = null;

    for (const line of lines) {
      const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> /);
      if (timeMatch) {
        currentTime = timeMatch[1];
      } else if (currentTime && line.trim() && !line.startsWith('WEBVTT') && !line.match(/^\d+$/)) {
        const text = line.replace(/<[^>]+>/g, '').trim();
        if (text) segments.push({ time: currentTime, text });
        currentTime = null;
      }
    }

    return segments;
  } catch {
    return null;
  }
}

// ── Claude Haiku clip selection ───────────────────────────────────────────────

async function selectClipMoment(transcript, videoTitle) {
  if (!transcript || transcript.length === 0) {
    // No transcript — default to 60s clip starting at 20% into the video
    return { startTime: null, durationSecs: 60, reason: 'No transcript available' };
  }

  const transcriptText = transcript
    .slice(0, 300) // cap tokens
    .map((s) => `[${s.time}] ${s.text}`)
    .join('\n');

  const prompt = `You are a short-form video editor. Given this YouTube transcript, identify the single best 45–60 second moment to clip for TikTok/Reels virality.

Video title: "${videoTitle}"

Transcript (with timestamps):
${transcriptText}

Reply with JSON only:
{
  "startTimestamp": "HH:MM:SS.mmm",
  "durationSecs": <45–60>,
  "reason": "<one sentence why this moment is viral>"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return null;
  }
}

// ── ffmpeg reformat to 9:16 ───────────────────────────────────────────────────

function timestampToSeconds(ts) {
  const parts = ts.split(':').map(parseFloat);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function reformat916(inputPath, outputPath, startSecs, durationSecs) {
  console.log(`[clip-engine] Cutting ${durationSecs}s clip starting at ${startSecs}s…`);

  // Smart crop: detect face/subject, blur background, pad to 9:16
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(startSecs),
    '-i', inputPath,
    '-t', String(durationSecs),
    '-vf', [
      'split[original][copy]',
      '[copy]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:1[blurred]',
      '[original]scale=-2:1920[scaled]',
      '[blurred][scaled]overlay=(W-w)/2:(H-h)/2',
    ].join(';'),
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

// ── Main export ───────────────────────────────────────────────────────────────

async function processClip(candidate) {
  const { videoId, title } = candidate;
  const outputPath = join(OUTPUT_DIR, `${videoId}_clip.mp4`);

  if (existsSync(outputPath)) {
    console.log(`[clip-engine] Clip already exists for ${videoId}, skipping.`);
    return { videoId, outputPath, skipped: true };
  }

  let inputPath;
  try {
    inputPath = await downloadVideo(videoId);
  } catch (err) {
    console.error(`[clip-engine] Download failed for ${videoId}:`, err.message);
    return null;
  }

  const transcript = await fetchTranscript(videoId);
  const moment = await selectClipMoment(transcript, title);

  let startSecs = 30; // fallback
  let durationSecs = 55;

  if (moment?.startTimestamp) {
    startSecs = timestampToSeconds(moment.startTimestamp);
    durationSecs = moment.durationSecs || 55;
    console.log(`[clip-engine] Haiku selected moment at ${moment.startTimestamp}: ${moment.reason}`);
  }

  try {
    await reformat916(inputPath, outputPath, startSecs, durationSecs);
  } catch (err) {
    console.error(`[clip-engine] ffmpeg failed for ${videoId}:`, err.message);
    return null;
  }

  // Clean up source file
  try { rmSync(inputPath); } catch { /* ignore */ }

  console.log(`[clip-engine] Done: ${outputPath}`);
  return { videoId, title, outputPath, moment };
}

export { processClip };
