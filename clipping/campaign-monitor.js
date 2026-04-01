/**
 * campaign-monitor.js — Phoenix Clipping Agent
 * Scrapes Vyro, Whop, and ClipAffiliates for active campaigns.
 * Filters by CPM floor set in config.json and returns ranked opportunities.
 */

import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config.json', 'utf8'));
const { minCpm, platforms } = config.campaigns;

// ── Vyro ─────────────────────────────────────────────────────────────────────

async function scrapeVyro(page) {
  console.log('[campaign-monitor] Scraping Vyro…');
  const campaigns = [];

  try {
    await page.goto('https://vyro.com/campaigns', {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    // Vyro lists campaigns as cards with CPM and budget info
    const items = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="campaign-card"], .campaign-card, .campaign-item'));
      return cards.map((card) => ({
        title: card.querySelector('h2, h3, .title, .campaign-title')?.textContent?.trim() || '',
        cpm: card.querySelector('.cpm, [data-cpm], .rate')?.textContent?.trim() || '',
        budget: card.querySelector('.budget, .remaining')?.textContent?.trim() || '',
        url: card.querySelector('a')?.href || '',
      }));
    });

    for (const item of items) {
      const cpmVal = parseCpm(item.cpm);
      if (cpmVal >= minCpm) {
        campaigns.push({ platform: 'vyro', cpm: cpmVal, ...item });
      }
    }
  } catch (err) {
    console.error('[campaign-monitor] Vyro scrape error:', err.message);
  }

  return campaigns;
}

// ── Whop ──────────────────────────────────────────────────────────────────────

async function scrapeWhop(page) {
  console.log('[campaign-monitor] Scraping Whop…');
  const campaigns = [];

  try {
    await page.goto('https://whop.com/discover/?category=clipping', {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    const items = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.product-card, [data-component="ProductCard"], article'));
      return cards.map((card) => ({
        title: card.querySelector('h2, h3, .product-name')?.textContent?.trim() || '',
        cpm: card.querySelector('.price, .cpm, .rate')?.textContent?.trim() || '',
        budget: card.querySelector('.budget, .slots')?.textContent?.trim() || '',
        url: card.querySelector('a')?.href || '',
      }));
    });

    for (const item of items) {
      const cpmVal = parseCpm(item.cpm);
      if (cpmVal >= minCpm) {
        campaigns.push({ platform: 'whop', cpm: cpmVal, ...item });
      }
    }
  } catch (err) {
    console.error('[campaign-monitor] Whop scrape error:', err.message);
  }

  return campaigns;
}

// ── ClipAffiliates ────────────────────────────────────────────────────────────

async function scrapeClipAffiliates(page) {
  console.log('[campaign-monitor] Scraping ClipAffiliates…');
  const campaigns = [];

  try {
    await page.goto('https://clipaffiliates.com/campaigns', {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    const items = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.campaign, .offer-card, [class*="campaign"]'));
      return cards.map((card) => ({
        title: card.querySelector('h2, h3, .title')?.textContent?.trim() || '',
        cpm: card.querySelector('.cpm, .rate, .payout')?.textContent?.trim() || '',
        budget: card.querySelector('.budget, .remaining, .cap')?.textContent?.trim() || '',
        url: card.querySelector('a')?.href || '',
      }));
    });

    for (const item of items) {
      const cpmVal = parseCpm(item.cpm);
      if (cpmVal >= minCpm) {
        campaigns.push({ platform: 'clipaffiliates', cpm: cpmVal, ...item });
      }
    }
  } catch (err) {
    console.error('[campaign-monitor] ClipAffiliates scrape error:', err.message);
  }

  return campaigns;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCpm(raw) {
  if (!raw) return 0;
  const match = raw.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

const SCRAPERS = { vyro: scrapeVyro, whop: scrapeWhop, clipaffiliates: scrapeClipAffiliates };

// ── Main export ───────────────────────────────────────────────────────────────

async function monitorCampaigns() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allCampaigns = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    for (const platform of platforms) {
      const scraper = SCRAPERS[platform];
      if (!scraper) {
        console.warn(`[campaign-monitor] Unknown platform: ${platform}`);
        continue;
      }
      const results = await scraper(page);
      allCampaigns.push(...results);
    }
  } finally {
    await browser.close();
  }

  // Sort by CPM descending
  allCampaigns.sort((a, b) => b.cpm - a.cpm);

  console.log(`[campaign-monitor] Found ${allCampaigns.length} campaigns above $${minCpm} CPM.`);
  return allCampaigns;
}

export { monitorCampaigns };
