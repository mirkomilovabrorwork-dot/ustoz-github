// Probe script v3: focus on sidebar combobox and import page
import { chromium } from '@playwright/test';
import path from 'path';

const BASE_URL = 'https://capweb-production-dd85.up.railway.app';
const EMAIL = 'admin@ustoz.uz';
const PASSWORD = 'UstozAdmin2026!';
const SS_DIR = 'C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-verify';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\mirko\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  console.log('--- Navigating to login ---');
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Screenshot 1
  await page.screenshot({ path: path.join(SS_DIR, 'probe-01-dashboard.png') });
  console.log('Screenshot: probe-01-dashboard.png');
  console.log('Dashboard loaded, URL:', page.url());

  // Body class
  const bodyClass = await page.evaluate(() => document.body.className);
  console.log(`[BODY CLASS]: "${bodyClass}"`);

  // Page text (first 600 chars)
  const pageText = await page.evaluate(() => document.body.innerText);
  console.log(`[PAGE TEXT first 600]:\n${pageText.substring(0, 600)}`);

  // Dump all visible buttons WITH bounding box y-coordinate
  console.log('\n=== ALL VISIBLE BUTTONS (sorted by y) ===');
  const buttons = await page.locator('button').all();
  const btnData = [];
  for (const btn of buttons) {
    try {
      const vis = await btn.isVisible();
      if (!vis) continue;
      const text = (await btn.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
      const dataTestId = await btn.getAttribute('data-testid').catch(() => '') || '';
      const cls = (await btn.getAttribute('class').catch(() => '') || '').substring(0, 100);
      const bb = await btn.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      btnData.push({ y, text, ariaLabel, dataTestId, cls, bb });
    } catch (e) { /* skip */ }
  }
  btnData.sort((a, b) => a.y - b.y);
  for (const b of btnData) {
    console.log(`  [BTN y=${b.y}] text="${b.text}" aria="${b.ariaLabel}" testid="${b.dataTestId}" cls="${b.cls.substring(0, 60)}"`);
  }

  // All visible links
  console.log('\n=== ALL VISIBLE LINKS ===');
  const links = await page.locator('a').all();
  for (const link of links) {
    try {
      const vis = await link.isVisible();
      if (!vis) continue;
      const text = (await link.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const href = await link.getAttribute('href').catch(() => '') || '';
      const bb = await link.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      if (text || href) console.log(`  [A y=${y}] text="${text}" href="${href}"`);
    } catch (e) { /* skip */ }
  }

  // All file inputs (including hidden)
  console.log('\n=== ALL input[type="file"] (visible + hidden) ===');
  const fileInputs = await page.locator('input[type="file"]').all();
  console.log(`Count: ${fileInputs.length}`);
  for (const fi of fileInputs) {
    try {
      const vis = await fi.isVisible();
      const id = await fi.getAttribute('id').catch(() => '') || '';
      const name = await fi.getAttribute('name').catch(() => '') || '';
      const accept = await fi.getAttribute('accept').catch(() => '') || '';
      const cls = (await fi.getAttribute('class').catch(() => '') || '').substring(0, 100);
      const bb = await fi.boundingBox().catch(() => null);
      console.log(`  [FILE-INPUT] visible=${vis} id="${id}" name="${name}" accept="${accept}" cls="${cls}" bb=${JSON.stringify(bb)}`);
    } catch (e) {
      console.log('  [FILE-INPUT] error:', e.message);
    }
  }

  // Find admin button — look for button with Admin text, lowest y coord (bottom of sidebar)
  console.log('\n=== FINDING ADMIN BUTTON ===');
  // Sort by highest y (furthest down screen)
  const adminCandidates = btnData.filter(b =>
    b.text.includes('Admin') || b.ariaLabel.includes('Admin') || b.text === 'A'
  );
  console.log('Admin candidates:', adminCandidates.map(b => `y=${b.y} text="${b.text}" aria="${b.ariaLabel}"`));

  // Pick the one with highest y (lowest on screen)
  const adminBtnInfo = adminCandidates.sort((a, b) => b.y - a.y)[0];

  let clickSelector = null;
  if (adminBtnInfo) {
    console.log(`Using admin button: y=${adminBtnInfo.y} text="${adminBtnInfo.text}"`);
    // Click it
    const adminBtn = page.locator(`button`).filter({ hasText: adminBtnInfo.text || 'Admin' }).last();
    const vis = await adminBtn.isVisible().catch(() => false);
    console.log(`button filter visible: ${vis}`);
    if (vis) {
      await adminBtn.click();
      clickSelector = `button:has-text("${adminBtnInfo.text}")`;
    }
  } else {
    // Fallback: find lowest-y button on left side (sidebar)
    console.log('No Admin text found — trying lowest left-side button');
    const leftBtns = btnData.filter(b => b.bb && b.bb.x < 300);
    const lowestLeft = leftBtns.sort((a, b) => b.y - a.y)[0];
    if (lowestLeft) {
      console.log(`Fallback button: y=${lowestLeft.y} text="${lowestLeft.text}"`);
      const btn = page.locator('button').filter({ hasText: lowestLeft.text || '' }).last();
      const vis = await btn.isVisible().catch(() => false);
      if (vis) {
        await btn.click();
        clickSelector = `button with text "${lowestLeft.text}"`;
      }
    }
  }

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SS_DIR, 'probe-02-after-click.png') });
  console.log('Screenshot: probe-02-after-click.png');
  console.log('Used click selector:', clickSelector);

  // Dump buttons after click
  console.log('\n=== BUTTONS + MENUITEMS AFTER ADMIN CLICK ===');
  const btns2 = await page.locator('button').all();
  for (const btn of btns2) {
    try {
      const vis = await btn.isVisible();
      if (!vis) continue;
      const text = (await btn.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
      const bb = await btn.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      console.log(`  [BTN2 y=${y}] text="${text}" aria="${ariaLabel}"`);
    } catch (e) { /* skip */ }
  }

  // menuitem roles
  const menuitems = await page.locator('[role="menuitem"]').all();
  console.log(`\n[MENUITEM count: ${menuitems.length}]`);
  for (const mi of menuitems) {
    try {
      const vis = await mi.isVisible();
      const text = (await mi.innerText().catch(() => '')).trim().replace(/\n/g, '|');
      const bb = await mi.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      console.log(`  [MENUITEM visible=${vis} y=${y}] text="${text}"`);
    } catch (e) { /* skip */ }
  }

  // Full menu children
  const menuChildren = await page.locator('[role="menu"] *').all();
  console.log(`\n[MENU CHILDREN: ${menuChildren.length}]`);
  for (const item of menuChildren.slice(0, 40)) {
    try {
      const vis = await item.isVisible();
      if (!vis) continue;
      const tag = await item.evaluate(el => el.tagName).catch(() => '');
      const text = (await item.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 60);
      const role = await item.getAttribute('role').catch(() => '') || '';
      console.log(`  [MENU-CHILD tag=${tag} role="${role}"] text="${text}"`);
    } catch (e) { /* skip */ }
  }

  // Check for dark mode toggle by text
  const darkToggle = await page.locator('text=/dark mode/i').all();
  console.log(`\n[DARK MODE elements: ${darkToggle.length}]`);
  for (const el of darkToggle) {
    try {
      const vis = await el.isVisible();
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      const text = (await el.innerText().catch(() => '')).trim();
      console.log(`  [DARK tag=${tag} visible=${vis}] text="${text}"`);
    } catch (e) { /* skip */ }
  }

  // Now do extra probing on the sidebar bottom section
  // Look for any element at y > 700 (bottom of viewport at 900px height)
  console.log('\n=== ELEMENTS AT y > 700 (bottom sidebar area) ===');
  const allClickable = await page.locator('button, a, [role="button"], [tabindex]').all();
  for (const el of allClickable) {
    try {
      const vis = await el.isVisible();
      if (!vis) continue;
      const bb = await el.boundingBox().catch(() => null);
      if (!bb || bb.y < 700) continue;
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      const text = (await el.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await el.getAttribute('aria-label').catch(() => '') || '';
      const role = await el.getAttribute('role').catch(() => '') || '';
      const cls = (await el.getAttribute('class').catch(() => '') || '').substring(0, 100);
      console.log(`  [y=${Math.round(bb.y)} tag=${tag} role="${role}"] text="${text}" aria="${ariaLabel}" cls="${cls.substring(0,60)}"`);
    } catch (e) { /* skip */ }
  }

  // Also check x < 300 (sidebar is typically left-side)
  console.log('\n=== ELEMENTS IN LEFT SIDEBAR (x < 300, all visible) ===');
  const allEls = await page.locator('button, a, [role="button"]').all();
  for (const el of allEls) {
    try {
      const vis = await el.isVisible();
      if (!vis) continue;
      const bb = await el.boundingBox().catch(() => null);
      if (!bb || bb.x > 300) continue;
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      const text = (await el.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await el.getAttribute('aria-label').catch(() => '') || '';
      const href = await el.getAttribute('href').catch(() => '') || '';
      console.log(`  [x=${Math.round(bb.x)} y=${Math.round(bb.y)} tag=${tag}] text="${text}" aria="${ariaLabel}" href="${href}"`);
    } catch (e) { /* skip */ }
  }

  // Check the sidebar bottom section HTML directly
  console.log('\n=== SIDEBAR HTML (element near y > 750) ===');
  try {
    // Try to get the nav/sidebar HTML
    const sidebarHtml = await page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first().innerHTML().catch(() => '');
    if (sidebarHtml) {
      console.log('Sidebar HTML (first 2000 chars):');
      console.log(sidebarHtml.substring(0, 2000));
    } else {
      // Get from body directly, look for admin element
      const bodyHtml = await page.evaluate(() => document.body.innerHTML);
      const adminIdx = bodyHtml.indexOf('Admin');
      if (adminIdx > 0) {
        console.log('Admin in HTML at index', adminIdx, ':', bodyHtml.substring(Math.max(0, adminIdx - 300), adminIdx + 300));
      }
    }
  } catch (e) {
    console.log('Sidebar HTML error:', e.message);
  }

  // Navigate to /dashboard/import to check for file inputs there
  console.log('\n=== NAVIGATING TO /dashboard/import ===');
  await page.goto(BASE_URL + '/dashboard/import', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SS_DIR, 'probe-03-import.png') });
  console.log('Screenshot: probe-03-import.png, URL:', page.url());

  const importText = await page.evaluate(() => document.body.innerText);
  console.log('[IMPORT PAGE TEXT first 500]:', importText.substring(0, 500));

  const importFileInputs = await page.locator('input[type="file"]').all();
  console.log(`File inputs on import page: ${importFileInputs.length}`);
  for (const fi of importFileInputs) {
    try {
      const vis = await fi.isVisible();
      const id = await fi.getAttribute('id').catch(() => '') || '';
      const name = await fi.getAttribute('name').catch(() => '') || '';
      const accept = await fi.getAttribute('accept').catch(() => '') || '';
      const cls = (await fi.getAttribute('class').catch(() => '') || '').substring(0, 100);
      const bb = await fi.boundingBox().catch(() => null);
      console.log(`  [FILE-INPUT] visible=${vis} id="${id}" name="${name}" accept="${accept}" cls="${cls}" bb=${JSON.stringify(bb)}`);
    } catch (e) {
      console.log('  [FILE-INPUT error]', e.message);
    }
  }

  const importBtns = await page.locator('button').all();
  console.log('\nButtons on import page:');
  for (const btn of importBtns) {
    try {
      const vis = await btn.isVisible();
      if (!vis) continue;
      const text = (await btn.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
      const bb = await btn.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      console.log(`  [BTN y=${y}] text="${text}" aria="${ariaLabel}"`);
    } catch (e) { /* skip */ }
  }

  // Also check for a video detail page — navigate to one existing video
  console.log('\n=== NAVIGATING TO VIDEO DETAIL (/s/2t4a58an7acz3bb) ===');
  await page.goto(BASE_URL + '/s/2t4a58an7acz3bb', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SS_DIR, 'probe-04-video.png') });
  console.log('Screenshot: probe-04-video.png, URL:', page.url());
  const videoText = await page.evaluate(() => document.body.innerText);
  console.log('[VIDEO PAGE TEXT first 800]:', videoText.substring(0, 800));

  // Check for AI button on video page
  const videoBtns = await page.locator('button').all();
  console.log('\nButtons on video page:');
  for (const btn of videoBtns) {
    try {
      const vis = await btn.isVisible();
      if (!vis) continue;
      const text = (await btn.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
      const bb = await btn.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      console.log(`  [BTN y=${y}] text="${text}" aria="${ariaLabel}"`);
    } catch (e) { /* skip */ }
  }

  // Also try the dashboard cap detail path
  console.log('\n=== NAVIGATING TO /dashboard/caps/2t4a58an7acz3bb ===');
  await page.goto(BASE_URL + '/dashboard/caps/2t4a58an7acz3bb', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SS_DIR, 'probe-05-cap-detail.png') });
  console.log('Screenshot: probe-05-cap-detail.png, URL:', page.url());
  const capText = await page.evaluate(() => document.body.innerText);
  console.log('[CAP DETAIL TEXT first 600]:', capText.substring(0, 600));

  const capBtns = await page.locator('button').all();
  console.log('\nButtons on cap detail:');
  for (const btn of capBtns) {
    try {
      const vis = await btn.isVisible();
      if (!vis) continue;
      const text = (await btn.innerText().catch(() => '')).trim().replace(/\n/g, '|').substring(0, 80);
      const ariaLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
      const bb = await btn.boundingBox().catch(() => null);
      const y = bb ? Math.round(bb.y) : 9999;
      console.log(`  [BTN y=${y}] text="${text}" aria="${ariaLabel}"`);
    } catch (e) { /* skip */ }
  }

  await browser.close();
  console.log('\n--- PROBE DONE ---');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
