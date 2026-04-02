/**
 * campaign-monitor.js — Phoenix Clipping Agent
 * Scrapes Vyro, Whop, and ClipAffiliates for active campaigns.
 * Filters by CPM floor set in config.json and returns ranked opportunities.
 *
 * Auth: Add session cookies to config.json under campaigns.sessions.<platform>
 * Debug: Set campaigns.debug = true to dump page HTML on zero results.
 */

import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const config = JSON.parse(readFileSync('./config.json', 'utf8'));
const { minCpm, platforms, sessions = {}, debug = false } = config.campaigns;

// ── Debug helper ──────────────────────────────────────────────────────────────

function dumpHtml(name, html) {
  if (!debug) return;
  try {
    mkdirSync('./debug', { recursive: true });
    const file = join('./debug', `${name}-${Date.now()}.html`);
    writeFileSync(file, html.slice(0, 80_000));
    console.log(`[campaign-monitor] Debug HTML saved → ${file}`);
  } catch (_) {}
}

// ── Cookie helper ─────────────────────────────────────────────────────────────

async function applyCookies(page, domain, cookieStr) {
  if (!cookieStr) return;
  const cookies = cookieStr.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain };
  });
  await page.setCookie(...cookies);
}

// ── __NEXT_DATA__ extractor ───────────────────────────────────────────────────

async function extractNextData(page) {
  return page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (_) { return null; }
  });
}

// Recursively collect objects from Next.js page data that look like products
function collectProducts(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return [];
  const results = [];
  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...collectProducts(item, depth + 1));
    return results;
  }
  // Looks like a product/campaign if it has a name/title and some kind of price or rate
  const hasName = obj.name || obj.title || obj.headline;
  const hasPrice = obj.price != null || obj.cpm != null || obj.rate != null ||
                   obj.priceInCents != null || obj.payoutRate != null;
  if (hasName && (hasPrice || obj.visibility === 'public')) {
    results.push(obj);
  }
  for (const val of Object.values(obj)) {
    results.push(...collectProducts(val, depth + 1));
  }
  return results;
}

// ── Vyro ─────────────────────────────────────────────────────────────────────

async function scrapeVyro(page) {
  console.log('[campaign-monitor] Scraping Vyro…');
  const campaigns = [];
  const hasCookies = !!sessions.vyro;

  try {
    if (hasCookies) {
      await applyCookies(page, 'app.vyro.com', sessions.vyro);
      await page.goto('https://app.vyro.com/campaigns', {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });
    } else {
      // Public homepage shows featured campaigns without login
      await page.goto('https://vyro.com/', {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });
      console.log('[campaign-monitor] Vyro: no session cookies — scraping public homepage. Add campaigns.sessions.vyro to config.json for full access.');
    }

    const html = await page.content();

    // Try __NEXT_DATA__ first (Vyro is a Next.js/React app)
    const nextData = await extractNextData(page);
    if (nextData) {
      const products = collectProducts(nextData);
      for (const p of products) {
        const cpmVal = parseCpm(String(p.cpm ?? p.rate ?? p.payoutRate ?? p.price ?? ''));
        if (cpmVal >= minCpm) {
          campaigns.push({
            platform: 'vyro',
            cpm: cpmVal,
            title: p.name || p.title || p.headline || '',
            budget: String(p.budget ?? p.remaining ?? ''),
            url: p.url || p.href || p.link || 'https://vyro.com/',
          });
        }
      }
    }

    // CSS selector fallback — multiple selector sets
    if (campaigns.length === 0) {
      const items = await page.evaluate(() => {
        const selectors = [
          '[data-testid="campaign-card"]',
          '[data-testid="campaign-item"]',
          '.campaign-card',
          '.campaign-item',
          '[class*="campaign"]',
          '[class*="CampaignCard"]',
          '[class*="CampaignItem"]',
          'article',
          '[role="listitem"]',
        ];
        let cards = [];
        for (const sel of selectors) {
          cards = Array.from(document.querySelectorAll(sel));
          if (cards.length > 0) break;
        }
        return cards.map((card) => ({
          title: card.querySelector('h1,h2,h3,h4,[class*="title"],[class*="Title"],[class*="name"],[class*="Name"]')?.textContent?.trim() || '',
          cpm: card.querySelector('[class*="cpm"],[class*="Cpm"],[class*="rate"],[class*="Rate"],[class*="payout"],[class*="Payout"]')?.textContent?.trim() || '',
          budget: card.querySelector('[class*="budget"],[class*="Budget"],[class*="remaining"],[class*="Remaining"]')?.textContent?.trim() || '',
          url: card.querySelector('a')?.href || '',
        }));
      });

      for (const item of items) {
        const cpmVal = parseCpm(item.cpm);
        if (cpmVal >= minCpm) {
          campaigns.push({ platform: 'vyro', cpm: cpmVal, ...item });
        }
      }
    }

    if (campaigns.length === 0) dumpHtml('vyro', html);
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
    if (sessions.whop) {
      await applyCookies(page, 'whop.com', sessions.whop);
    }

    // Whop's marketplace search — clipping is a product category
    await page.goto('https://whop.com/marketplace/?q=clipping', {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    const html = await page.content();

    // Whop is Next.js — __NEXT_DATA__ is the most reliable extraction path
    const nextData = await extractNextData(page);
    if (nextData) {
      const products = collectProducts(nextData);
      for (const p of products) {
        const rawPrice = p.priceInCents != null
          ? (p.priceInCents / 1000).toFixed(2)  // cents → CPM estimate
          : String(p.price ?? p.cpm ?? p.rate ?? '');
        const cpmVal = parseCpm(rawPrice);
        // Whop: include free products ($0) as they may be CPM-paid campaigns
        const effectiveCpm = cpmVal === 0 ? minCpm : cpmVal;
        if (effectiveCpm >= minCpm) {
          campaigns.push({
            platform: 'whop',
            cpm: cpmVal,
            title: p.name || p.title || p.route || '',
            budget: String(p.memberCount ?? p.soldCount ?? p.slots ?? ''),
            url: p.route ? `https://whop.com/${p.route}/` : p.url || 'https://whop.com/marketplace/',
          });
        }
      }
    }

    // CSS fallback — Whop uses Tailwind with hashed classes; anchor on semantic structure
    if (campaigns.length === 0) {
      const items = await page.evaluate(() => {
        // Whop product cards are <a> tags wrapping a card; find links in the product grid
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const productLinks = allLinks.filter((a) => {
          const href = a.getAttribute('href') || '';
          // Product pages look like /creator-name/product-name/
          return /^\/[^/]+\/[^/]+\/?$/.test(href) && !href.startsWith('/blog') && !href.startsWith('/marketplace');
        });
        return productLinks.map((a) => {
          const text = a.textContent?.trim() || '';
          const priceMatch = text.match(/\$[\d,.]+/);
          return {
            title: a.querySelector('h2,h3,[class*="name"],[class*="Name"],[class*="title"],[class*="Title"]')?.textContent?.trim()
                   || text.slice(0, 80),
            cpm: priceMatch?.[0] || '',
            budget: a.querySelector('[class*="member"],[class*="Member"],[class*="slot"],[class*="Slot"]')?.textContent?.trim() || '',
            url: a.href,
          };
        }).filter((item) => item.title);
      });

      for (const item of items) {
        const cpmVal = parseCpm(item.cpm);
        // Accept free/unknown-CPM Whop listings — CPM is per-platform, not listed on product page
        if (cpmVal >= minCpm || item.title.toLowerCase().includes('clip')) {
          campaigns.push({ platform: 'whop', cpm: cpmVal, ...item });
        }
      }
    }

    if (campaigns.length === 0) dumpHtml('whop', html);
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
    if (sessions.clipaffiliates) {
      await applyCookies(page, 'clipaffiliates.com', sessions.clipaffiliates);
    }

    // Try campaigns page first, fall back to homepage
    const urls = ['https://clipaffiliates.com/campaigns', 'https://clipaffiliates.com/'];
    let html = '';

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      html = await page.content();
      // If we landed on a login redirect, try the next URL
      const isLoginPage = html.includes('sign-in') || html.includes('Sign In') || html.includes('login');
      const hasCampaignContent = html.toLowerCase().includes('campaign') || html.toLowerCase().includes('cpm');
      if (hasCampaignContent && !isLoginPage) break;
      if (isLoginPage && !sessions.clipaffiliates) {
        console.log(`[campaign-monitor] ClipAffiliates: ${url} requires login. Add campaigns.sessions.clipaffiliates to config.json.`);
      }
    }

    // Try __NEXT_DATA__ / __NUXT_DATA__ / embedded JSON
    const nextData = await extractNextData(page);
    if (nextData) {
      const products = collectProducts(nextData);
      for (const p of products) {
        const cpmVal = parseCpm(String(p.cpm ?? p.rate ?? p.payout ?? p.payoutRate ?? p.price ?? ''));
        if (cpmVal >= minCpm) {
          campaigns.push({
            platform: 'clipaffiliates',
            cpm: cpmVal,
            title: p.name || p.title || p.brandName || '',
            budget: String(p.budget ?? p.remaining ?? p.cap ?? ''),
            url: p.url || p.href || 'https://clipaffiliates.com/',
          });
        }
      }
    }

    // CSS fallback — try broad selector sets
    if (campaigns.length === 0) {
      const items = await page.evaluate(() => {
        const selectors = [
          '[class*="campaign"]',
          '[class*="Campaign"]',
          '[class*="offer"]',
          '[class*="Offer"]',
          '[class*="card"]',
          '[class*="Card"]',
          'article',
          '[role="listitem"]',
          'li',
        ];
        let cards = [];
        for (const sel of selectors) {
          const found = Array.from(document.querySelectorAll(sel)).filter((el) => {
            const text = el.textContent || '';
            return text.includes('CPM') || text.includes('$') || text.includes('/1,000');
          });
          if (found.length > 0) { cards = found; break; }
        }
        return cards.map((card) => ({
          title: card.querySelector('h1,h2,h3,h4,[class*="title"],[class*="Title"],[class*="name"],[class*="Name"],[class*="brand"],[class*="Brand"]')?.textContent?.trim() || card.textContent?.trim().slice(0, 80) || '',
          cpm: card.querySelector('[class*="cpm"],[class*="CPM"],[class*="rate"],[class*="Rate"],[class*="payout"],[class*="Payout"]')?.textContent?.trim()
               || (card.textContent?.match(/\$[\d.]+\s*(?:CPM|\/1[,.]?000|per\s+1[,.]?000)/i)?.[0] || ''),
          budget: card.querySelector('[class*="budget"],[class*="Budget"],[class*="remaining"],[class*="cap"],[class*="Cap"]')?.textContent?.trim() || '',
          url: card.querySelector('a')?.href || '',
        })).filter((item) => item.title || item.cpm);
      });

      for (const item of items) {
        const cpmVal = parseCpm(item.cpm);
        if (cpmVal >= minCpm) {
          campaigns.push({ platform: 'clipaffiliates', cpm: cpmVal, ...item });
        }
      }
    }

    if (campaigns.length === 0) dumpHtml('clipaffiliates', html);
  } catch (err) {
    console.error('[campaign-monitor] ClipAffiliates scrape error:', err.message);
  }

  return campaigns;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCpm(raw) {
  if (!raw) return 0;
  // Strip currency symbols and extract first number
  const match = String(raw).replace(/,/g, '').match(/[\d.]+/);
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
    // Intercept and log console errors from the page (helps debug selector issues)
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.warn('[page-error]', msg.text());
    });

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

  // Deduplicate by URL, sort by CPM descending
  const seen = new Set();
  const unique = allCampaigns.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
  unique.sort((a, b) => b.cpm - a.cpm);

  console.log(`[campaign-monitor] Found ${unique.length} campaigns above $${minCpm} CPM.`);
  return unique;
}

export { monitorCampaigns };
