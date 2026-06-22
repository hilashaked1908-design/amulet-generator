#!/usr/bin/env node
/**
 * Verify Q1 wish text changes metal emboss SVG (not cached/hardcoded).
 * Compares .layer-metal-emboss path fingerprints for two different Q1 strings.
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '8080';
const BASE = `http://127.0.0.1:${PORT}/prototype-v2-thick.html?svg=1`;

const CASES = [
  {
    label: 'Q1-current',
    q1: 'בית גדול בתאילנד אמן',
  },
  {
    label: 'Q1-alt',
    q1: 'שלום עולם יפה מאוד',
  },
];

async function metalEmbossFingerprint(page) {
  return page.evaluate(() => {
    const q = window.__lastQuestionnaire;
    const emboss = document.querySelector('#amuletContainer .layer-metal-emboss');
    const paths = emboss ? [...emboss.querySelectorAll('path')] : [];
    const dHash = paths
      .map((p) => p.getAttribute('d') || '')
      .join('|')
      .split('')
      .reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
    return {
      wishText: q?.wishText ?? null,
      embossedLetters: q?.embossedLetters ?? null,
      metalEmbossSeed: q?.metalEmbossPattern?.seed ?? null,
      pathCount: paths.length,
      dHash,
      dLen: paths.reduce((n, p) => n + (p.getAttribute('d')?.length || 0), 0),
    };
  });
}

async function composeWithQ1(page, q1) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => typeof window.ConnectionCore !== 'undefined', null, {
    timeout: 60000,
  });
  await page.fill('#q1Wish', q1);
  await page.fill('#q2Name', 'דנה');
  await page.fill('#q3WhyNow', 'עכשיו זה הזמן');
  await page.click('#createBtn');
  await page.waitForFunction(
    () =>
      window.__lastQuestionnaire &&
      document.querySelector('#amuletContainer .layer-metal-emboss path'),
    null,
    { timeout: 180000 }
  );
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const results = [];

  for (const c of CASES) {
    await composeWithQ1(page, c.q1);
    const fp = await metalEmbossFingerprint(page);
    results.push({ label: c.label, q1: c.q1, ...fp });
    console.log(JSON.stringify({ label: c.label, ...fp }, null, 2));
  }

  await browser.close();

  const a = results[0];
  const b = results[1];
  const shapeDiffers =
    a.dHash !== b.dHash ||
    a.dLen !== b.dLen ||
    JSON.stringify(a.embossedLetters) !== JSON.stringify(b.embossedLetters);

  console.log('\n--- verdict ---');
  console.log('letters differ:', JSON.stringify(a.embossedLetters), 'vs', JSON.stringify(b.embossedLetters));
  console.log('path geometry differs:', shapeDiffers);
  console.log('Q1 wired (not hardcoded):', shapeDiffers ? 'YES' : 'NO — investigate');
  process.exit(shapeDiffers ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
