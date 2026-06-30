// Poll the live recorder dialog header until the canonical <Logo>'s
// <text>data365</text> element appears (= new deploy live), then capture
// light + dark screenshots and report.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const BASE = 'https://capweb-production-dd85.up.railway.app';
const EMAIL = 'admin@ustoz.uz';
const PASSWORD = 'UstozAdmin2026!';
const DIR = 'C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\f1d9a38f-dc67-470a-a166-36325f0c4a8f\\scratchpad\\';
await fs.mkdir(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function probe(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([
    { name: 'theme', value: theme, domain: 'capweb-production-dd85.up.railway.app', path: '/' },
  ]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 40000 });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 40000 });
  await page.goto(BASE + '/dashboard/caps/record', { waitUntil: 'networkidle', timeout: 40000 });
  await page.getByRole('button', { name: /Record in Browser/i }).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { ok: false, err: 'no dialog' };
    // The new canonical <Logo> uses <text>data365</text> for the wordmark.
    // The old vector-path "Cap" had NO <text> element inside the logo svg.
    const texts = [...d.querySelectorAll('svg text')].map((t) => t.textContent?.trim());
    const headerSvg = d.querySelector('svg[aria-label="data365 Logo"]');
    const hasNewLogo = headerSvg && headerSvg.querySelector('text')?.textContent?.trim() === 'data365';
    const r = headerSvg?.getBoundingClientRect();
    return {
      ok: !!hasNewLogo,
      texts,
      hasHeaderSvg: !!headerSvg,
      logoBox: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    };
  });

  const screenshotPath = DIR + `verify-recorder-${theme}.png`;
  await page.locator('[role="dialog"]').first().screenshot({ path: screenshotPath }).catch(() => {});
  await ctx.close();
  return { ...result, screenshotPath };
}

const MAX_MIN = 8;
const start = Date.now();
let attempt = 0;
while ((Date.now() - start) / 60000 < MAX_MIN) {
  attempt++;
  let r;
  try {
    r = await probe('light');
  } catch (e) {
    console.log(`[t+${((Date.now()-start)/1000).toFixed(0)}s] attempt ${attempt}: probe error: ${e.message}`);
    await new Promise((res) => setTimeout(res, 20000));
    continue;
  }
  console.log(`[t+${((Date.now()-start)/1000).toFixed(0)}s] attempt ${attempt}: hasHeaderSvg=${r.hasHeaderSvg} newLogo=${r.ok} texts=${JSON.stringify(r.texts)} box=${JSON.stringify(r.logoBox)}`);
  if (r.ok) {
    console.log('\n=== NEW DEPLOY LIVE — recorder header now uses canonical Logo ===');
    console.log('Light screenshot:', r.screenshotPath);
    // also dark
    const dark = await probe('dark');
    console.log('Dark screenshot: ', dark.screenshotPath, '| newLogo:', dark.ok);
    await browser.close();
    process.exit(0);
  }
  await new Promise((res) => setTimeout(res, 20000));
}
console.log('\n=== TIMEOUT — deploy did not flip within '+MAX_MIN+' min ===');
await browser.close();
process.exit(1);
