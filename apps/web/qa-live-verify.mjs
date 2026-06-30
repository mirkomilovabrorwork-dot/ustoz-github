import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = 'https://capweb-production-dd85.up.railway.app';
const EMAIL = 'admin@ustoz.uz';
const PASSWORD = 'UstozAdmin2026!';
const SS_DIR = 'C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-verify';
const TEST_VIDEO = 'D:\\vibecoding\\ustoz-github\\tmp-qa\\test-demo.mp4';

function ss(name) {
  return path.join(SS_DIR, name);
}

async function login(page) {
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  // Fill email and password
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
  console.log('Logged in, URL:', page.url());
}

async function testA(browser) {
  console.log('\n=== TEST A: Dark-mode toggle ===');
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page);
  await page.waitForLoadState('networkidle');

  // Read initial body class
  const classBefore = await page.evaluate(() => document.body.className);
  console.log('Body class BEFORE toggle:', JSON.stringify(classBefore));
  await page.screenshot({ path: ss('A1-before-toggle.png') });

  // Look for Admin account menu — try multiple selectors
  const adminMenuSelectors = [
    '[data-testid="account-menu"]',
    '[aria-label="Account menu"]',
    'button:has-text("Admin")',
    '[data-testid="user-menu"]',
    // Bottom-left user button
    'button[class*="account"]',
    'button[class*="user"]',
  ];

  let menuOpened = false;
  for (const sel of adminMenuSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        menuOpened = true;
        console.log('Opened menu via:', sel);
        break;
      }
    } catch (e) {}
  }

  if (!menuOpened) {
    await page.screenshot({ path: ss('A-menu-debug.png') });
    // Try any button in bottom area containing "admin" or user info
    const adminText = page.getByText('admin@ustoz.uz', { exact: false });
    if (await adminText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await adminText.click();
      menuOpened = true;
      console.log('Opened via email text click');
    }
  }

  if (!menuOpened) {
    // Try clicking at bottom-left
    const viewport = page.viewportSize();
    await page.mouse.click(80, viewport.height - 40);
    await page.waitForTimeout(500);
    menuOpened = true;
    console.log('Tried bottom-left coordinate click');
  }

  await page.waitForTimeout(800);
  await page.screenshot({ path: ss('A2-menu-open.png') });

  // Find and click "Toggle Dark Mode"
  const darkModeSelectors = [
    'text=Toggle Dark Mode',
    '[role="menuitem"]:has-text("Dark")',
    'button:has-text("Dark Mode")',
    '[role="menuitem"]:has-text("Toggle Dark")',
    'li:has-text("Toggle Dark Mode")',
  ];

  let toggled = false;
  for (const sel of darkModeSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click();
        toggled = true;
        console.log('Clicked dark mode via:', sel);
        break;
      }
    } catch (e) {}
  }

  if (!toggled) {
    await page.screenshot({ path: ss('A-darkmode-debug.png') });
    // Log all visible text to find the menu item
    const allText = await page.locator('body').innerText();
    console.log('Visible text (first 800 chars):', allText.substring(0, 800));
    console.log('Could not find "Toggle Dark Mode" menu item');
  }

  // IMMEDIATELY (no reload) read body class
  const classAfter = await page.evaluate(() => document.body.className);
  console.log('Body class AFTER toggle (no reload):', JSON.stringify(classAfter));
  await page.screenshot({ path: ss('A3-after-toggle.png') });

  const darkBefore = classBefore.includes('dark');
  const darkAfter = classAfter.includes('dark');
  const changed = darkBefore !== darkAfter;

  console.log(`Dark before: ${darkBefore} | Dark after: ${darkAfter} | Changed: ${changed}`);

  let verdict;
  if (toggled && changed) {
    verdict = 'PASS — class changed instantly without reload';
  } else if (!toggled) {
    verdict = 'FAIL — could not click Toggle Dark Mode';
  } else {
    verdict = 'FAIL — class did NOT change after toggle';
  }
  console.log('TEST A:', verdict);

  // Toggle back to restore state
  if (toggled) {
    for (const sel of adminMenuSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) { await el.click(); break; }
      } catch (e) {}
    }
    if (!menuOpened) {
      const adminText = page.getByText('admin@ustoz.uz', { exact: false });
      if (await adminText.isVisible({ timeout: 2000 }).catch(() => false)) await adminText.click();
    }
    await page.waitForTimeout(500);
    for (const sel of darkModeSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) { await el.click(); break; }
      } catch (e) {}
    }
    const classAfterBack = await page.evaluate(() => document.body.className);
    console.log('Body class after toggle BACK:', JSON.stringify(classAfterBack));
  }

  await context.close();
  return { classBefore, classAfter, toggled, changed, verdict };
}

async function testB(browser) {
  console.log('\n=== TEST B: Cost-confirmation dialog ===');
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track /generate network calls
  const generateCalls = [];
  page.on('request', req => {
    if (req.url().includes('/generate') || req.url().includes('generate-ai')) {
      generateCalls.push({ url: req.url(), time: Date.now() });
      console.log('GENERATE CALL:', req.url());
    }
  });

  await login(page);
  await page.waitForLoadState('networkidle');
  await page.goto(BASE_URL + '/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: ss('B1-dashboard.png') });

  // Look for import/upload button to trigger file input
  const importBtnSelectors = [
    'button:has-text("Import")',
    'button:has-text("Upload")',
    'text=Import video',
    'text=Upload video',
    '[aria-label*="import" i]',
    '[aria-label*="upload" i]',
    'button:has-text("New recording")',
    'button:has-text("Add")',
  ];

  for (const sel of importBtnSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        console.log('Clicking import button:', sel);
        await el.click();
        await page.waitForTimeout(1000);
        break;
      }
    } catch (e) {}
  }

  await page.screenshot({ path: ss('B2-after-import-click.png') });

  // Set file on any file input
  const fileInputs = page.locator('input[type="file"]');
  const inputCount = await fileInputs.count();
  console.log('File inputs on page:', inputCount);

  let uploaded = false;
  for (let i = 0; i < inputCount; i++) {
    try {
      await fileInputs.nth(i).setInputFiles(TEST_VIDEO);
      uploaded = true;
      console.log('File uploaded via input index', i);
      break;
    } catch (e) {
      console.log('Input', i, 'failed:', e.message.substring(0, 100));
    }
  }

  if (!uploaded) {
    console.log('TEST B: FAIL — could not upload file');
    await page.screenshot({ path: ss('B-upload-fail.png') });
    await context.close();
    return { uploaded: false };
  }

  // Wait for upload processing (up to 30s)
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: ss('B3-after-upload.png') });

  // Find the video page we're on or navigate to new video
  let videoPageUrl = page.url();
  let videoId = null;

  // Extract video ID from current URL
  const urlMatch = videoPageUrl.match(/\/(?:videos|caps|s)\/([a-z0-9]+)/);
  if (urlMatch) {
    videoId = urlMatch[1];
    console.log('Video ID from URL:', videoId);
  }

  // If still on dashboard, find the newest video card
  if (videoPageUrl.includes('/dashboard')) {
    await page.waitForTimeout(3000);
    const videoCards = page.locator('a[href*="/videos/"], a[href*="/caps/"], a[href*="/s/"]');
    const cardCount = await videoCards.count();
    console.log('Video cards found:', cardCount);
    if (cardCount > 0) {
      const href = await videoCards.first().getAttribute('href');
      console.log('First card href:', href);
      videoId = href?.match(/\/([a-z0-9]+)\/?$/)?.[1];
      videoPageUrl = href?.startsWith('http') ? href : BASE_URL + href;
    }
  }

  console.log('Navigating to video page:', videoPageUrl, 'ID:', videoId);
  if (videoPageUrl && !videoPageUrl.includes('/dashboard')) {
    await page.goto(videoPageUrl, { waitUntil: 'networkidle', timeout: 30000 });
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: ss('B4-video-page.png') });

  // Look for "Start AI analysis" button
  const startAISelectors = [
    'button:has-text("Start AI analysis")',
    'button:has-text("Start AI")',
    'button:has-text("Generate AI")',
    'button:has-text("AI analysis")',
    'text=Start AI analysis',
    '[data-testid="start-ai"]',
  ];

  let aiButton = null;
  for (const sel of startAISelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        aiButton = el;
        console.log('Found AI button:', sel);
        break;
      }
    } catch (e) {}
  }

  if (!aiButton) {
    const bodyText = await page.locator('body').innerText();
    console.log('No AI button found. Page text (first 600):', bodyText.substring(0, 600));
    await page.screenshot({ path: ss('B-ai-button-debug.png') });
  }

  let dialogSeen = false;
  let dialogText = '';
  let cancelWorked = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 4;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    console.log(`\nAttempt ${attempts} of ${MAX_ATTEMPTS}: clicking "Start AI analysis"`);

    // Re-search for AI button
    if (!aiButton) {
      for (const sel of startAISelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            aiButton = el;
            console.log('Found AI button on retry:', sel);
            break;
          }
        } catch (e) {}
      }
    }

    if (!aiButton) {
      console.log('No AI button on attempt', attempts);
      if (attempts < MAX_ATTEMPTS) {
        console.log('Waiting 90s and reloading...');
        await page.waitForTimeout(90000);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
      continue;
    }

    const genCallsBefore = generateCalls.length;
    await aiButton.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: ss(`B5-after-ai-click-attempt${attempts}.png`) });

    // Check for dialog
    const dialogSelectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[data-testid*="dialog"]',
      '[data-testid*="modal"]',
      '.modal',
      '[class*="dialog"]',
      '[class*="modal"]',
    ];

    for (const sel of dialogSelectors) {
      try {
        const dlg = page.locator(sel).first();
        if (await dlg.isVisible({ timeout: 2000 })) {
          dialogSeen = true;
          dialogText = await dlg.innerText();
          console.log(`DIALOG SEEN via "${sel}"! Text:`, dialogText);
          await page.screenshot({ path: ss(`B6-dialog-attempt${attempts}.png`) });
          break;
        }
      } catch (e) {}
    }

    if (dialogSeen) {
      // Click Cancel
      const cancelSelectors = [
        'button:has-text("Cancel")',
        'button:has-text("Bekor")',
        'button:has-text("Отмена")',
        'button:has-text("Yopish")',
        '[data-testid="cancel"]',
      ];

      let cancelClicked = false;
      for (const sel of cancelSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            await el.click();
            cancelClicked = true;
            console.log('Cancel clicked via:', sel);
            break;
          }
        } catch (e) {}
      }

      if (!cancelClicked) {
        // Press Escape
        await page.keyboard.press('Escape');
        console.log('Pressed Escape to cancel');
      }

      await page.waitForTimeout(1500);
      await page.screenshot({ path: ss('B7-after-cancel.png') });

      const genCallsAfter = generateCalls.length;
      const newCalls = genCallsAfter - genCallsBefore;
      console.log('New /generate calls after Cancel:', newCalls);

      // Still shows Start AI analysis?
      let stillShowsStart = false;
      for (const sel of startAISelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            stillShowsStart = true;
            break;
          }
        } catch (e) {}
      }
      console.log('Still shows Start AI analysis:', stillShowsStart);

      cancelWorked = newCalls === 0 && stillShowsStart;
      break;
    } else {
      const genCallsAfter = generateCalls.length;
      const newCalls = genCallsAfter - genCallsBefore;
      if (newCalls > 0) {
        console.log(`Generation fired immediately WITHOUT dialog (${newCalls} calls) — build may not be live`);
      } else {
        console.log('No dialog, no generation call — unclear state');
        const bodyText = await page.locator('body').innerText();
        console.log('Page text (first 400):', bodyText.substring(0, 400));
      }
      if (attempts < MAX_ATTEMPTS) {
        console.log('Waiting 90s and reloading...');
        await page.waitForTimeout(90000);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        aiButton = null;
      }
    }
  }

  if (dialogSeen) {
    if (cancelWorked) {
      console.log('TEST B: PASS — dialog appeared with cost info, Cancel prevented generation');
    } else {
      console.log('TEST B: PARTIAL — dialog appeared but Cancel may not have worked cleanly');
    }
  } else {
    console.log(`TEST B: FAIL — no dialog after ${attempts} attempt(s) — build may not be live or feature missing`);
  }

  // Cleanup: delete the test video
  let deleted = false;
  if (videoPageUrl && !videoPageUrl.includes('/dashboard')) {
    console.log('\nCleaning up — deleting test video...');
    await page.goto(videoPageUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Try the "..." menu
    const moreSelectors = [
      'button[aria-label="More options"]',
      'button[aria-label="More"]',
      '[data-testid="more-menu"]',
      'button[aria-label*="options" i]',
      'button[aria-haspopup="menu"]',
    ];

    for (const sel of moreSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          await page.waitForTimeout(700);
          console.log('More menu opened via:', sel);
          break;
        }
      } catch (e) {}
    }

    await page.screenshot({ path: ss('B8-before-delete.png') });

    const deleteMenuSelectors = [
      '[role="menuitem"]:has-text("Delete")',
      'button:has-text("Delete")',
      'text=Delete recording',
      'text=Delete video',
      'text=Delete',
    ];

    for (const sel of deleteMenuSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          await page.waitForTimeout(700);
          console.log('Delete clicked via:', sel);
          break;
        }
      } catch (e) {}
    }

    await page.screenshot({ path: ss('B9-delete-confirm-dialog.png') });

    // Confirm delete if confirmation dialog appears
    const confirmSelectors = [
      'button:has-text("Delete")',
      'button:has-text("Confirm")',
      'button:has-text("Yes")',
      'button:has-text("Ha")',
      '[data-testid="confirm-delete"]',
    ];

    for (const sel of confirmSelectors) {
      try {
        const el = page.locator(sel).last();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          deleted = true;
          console.log('Delete confirmed via:', sel);
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: ss('B10-after-delete.png') });
  }

  console.log('Video deleted:', deleted);
  await context.close();
  return { uploaded, videoId, videoPageUrl, dialogSeen, dialogText, cancelWorked, attempts, deleted };
}

async function main() {
  console.log('=== QA Live Verification ===');
  console.log('Base URL:', BASE_URL);
  console.log('Screenshots:', SS_DIR);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\mirko\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let resultA, resultB;

  try {
    resultA = await testA(browser);
  } catch (e) {
    console.error('TEST A EXCEPTION:', e.message);
    resultA = { error: e.message };
  }

  try {
    resultB = await testB(browser);
  } catch (e) {
    console.error('TEST B EXCEPTION:', e.message);
    resultB = { error: e.message };
  }

  await browser.close();

  console.log('\n========== FINAL REPORT ==========');
  console.log('TEST A:', JSON.stringify(resultA, null, 2));
  console.log('TEST B:', JSON.stringify(resultB, null, 2));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
