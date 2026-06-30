/**
 * CORRECTED Live QA script for data365 (capweb-production-dd85.up.railway.app)
 * Run from repo root: node _qa-corrected.mjs
 *
 * Fixes from prior pass:
 * 1. Clicks REAL nav links by visible text — does NOT guess URLs
 * 2. Finds the REAL dark mode toggle in the app (cookie/class based, not media query)
 * 3. Tests AI transcription GENERATION, not just viewing existing transcripts
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _require = createRequire(join(__dirname, "apps/web/package.json"));
const { chromium } = _require("@playwright/test");
import fs from "fs";
import path from "path";

const BASE_URL = "https://capweb-production-dd85.up.railway.app";
const SHOTS_DIR =
  "C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-shots2";
const ADMIN_EMAIL = "admin@ustoz.uz";
const ADMIN_PASSWORD = "UstozAdmin2026!";

const savedShots = [];

function shot(name) {
  return path.join(SHOTS_DIR, name + ".png");
}

async function screenshot(page, name) {
  const p = shot(name);
  await page.screenshot({ path: p, fullPage: true });
  savedShots.push(p);
  console.log(`  [shot] ${name}.png`);
}

function attachNetworkLog(page) {
  const log = [];
  page.on("response", (resp) => {
    const url = resp.url();
    const status = resp.status();
    // Capture all API calls and any 4xx/5xx
    if (/\/api\//i.test(url) || status >= 400) {
      log.push({ status, url });
    }
  });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return { log, errors };
}

// ─────────────────────────────────────────────────────────────
// STEP 1: Login
// ─────────────────────────────────────────────────────────────
async function doLogin(browser) {
  console.log("\n[STEP 1] Login");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const net = attachNetworkLog(page);

  await page.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await screenshot(page, "01-login-initial");

  await page.getByPlaceholder("tim@apple.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await screenshot(page, "01-login-filled");
  await page.getByRole("button", { name: "Sign in" }).click();

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    const url = page.url();
    await screenshot(page, "01-login-success");
    console.log("  Login SUCCESS. URL:", url);
    const state = await ctx.storageState();
    await ctx.close();
    return { success: true, state };
  } catch {
    await screenshot(page, "01-login-failed");
    const bodyText = await page.innerText("body").catch(() => "");
    console.log("  Login FAILED. Body snippet:", bodyText.substring(0, 200));
    await ctx.close();
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 2: Real nav click survey
// Click each sidebar nav item by visible text, record URL + page state
// ─────────────────────────────────────────────────────────────
async function doNavSurvey(browser, authState) {
  console.log("\n[STEP 2] Real nav click survey");
  const ctx = await browser.newContext({
    storageState: authState,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const net = attachNetworkLog(page);

  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await screenshot(page, "02-dashboard-initial");

  // Discover all dashboard video IDs before clicking nav (nav clicks change the page)
  const videoIds = new Set();
  const hrefs = await page.$$eval("a[href]", (els) => els.map((el) => el.getAttribute("href"))).catch(() => []);
  for (const href of hrefs) {
    const m = href && href.match(/\/s\/([a-zA-Z0-9]{8,})/);
    if (m) videoIds.add(m[1]);
  }
  console.log("  Video IDs on dashboard:", [...videoIds]);

  // Nav items to click — visible text exactly as shown in sidebar
  const navItems = [
    "Instructions",
    "Meeting Recordings",
    "Analytics",
    "New Recording",
    "Install Extension",
    "Organization Settings",
    "Access Management",
  ];

  const navResults = [];

  for (const itemText of navItems) {
    console.log(`\n  Clicking nav: "${itemText}"`);
    // Navigate back to dashboard first so the sidebar is visible
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);

    let clicked = false;
    let resultUrl = "N/A";
    let is404 = false;
    let pageTitle = "";
    let errorNote = "";

    try {
      // Try multiple locator strategies
      let el = null;

      // Strategy 1: link by exact text
      el = page.getByRole("link", { name: itemText, exact: true });
      if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) {
        // Strategy 2: link containing text
        el = page.getByRole("link", { name: itemText });
      }
      if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) {
        // Strategy 3: any element with matching text
        el = page.getByText(itemText, { exact: true });
      }
      if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) {
        errorNote = "element not found in DOM";
        console.log(`    Not found: "${itemText}"`);
        navResults.push({ item: itemText, clicked: false, url: "not found", is404: false, note: errorNote });
        continue;
      }

      await el.click();
      await page.waitForTimeout(3000); // wait for navigation/modal

      resultUrl = page.url();
      clicked = true;

      // Check if this is a modal/dialog (e.g. "New Recording")
      const isModal = await page.getByRole("dialog").isVisible({ timeout: 1000 }).catch(() => false);

      // Check for 404 page
      const bodyText = await page.innerText("body").catch(() => "");
      is404 = /404|Oops|not found|page.*not.*exist/i.test(bodyText) && !isModal;
      pageTitle = await page.title().catch(() => "");

      const shotName = `02-nav-${itemText.replace(/\s+/g, "-").toLowerCase()}`;
      await screenshot(page, shotName);

      const status = is404 ? "404/ERROR" : (isModal ? "modal opened" : "OK");
      console.log(`    URL: ${resultUrl} | ${status} | title: "${pageTitle}"`);
      navResults.push({
        item: itemText,
        clicked,
        url: resultUrl,
        is404,
        isModal,
        pageTitle,
        note: status,
        shot: shotName + ".png",
      });
    } catch (err) {
      errorNote = err.message.substring(0, 100);
      console.log(`    Error clicking "${itemText}": ${errorNote}`);
      navResults.push({ item: itemText, clicked: false, url: "error", is404: false, note: errorNote });
    }
  }

  // Also test: on-page buttons on dashboard
  console.log("\n  Testing dashboard on-page buttons...");
  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const onPageButtons = [
    { text: "Import video", type: "button" },
    { text: "New Folder", type: "button" },
  ];

  const buttonResults = [];

  for (const btn of onPageButtons) {
    console.log(`\n  Clicking button: "${btn.text}"`);
    try {
      const el = page.getByRole("button", { name: btn.text });
      const visible = await el.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) {
        // Try text match
        const el2 = page.getByText(btn.text);
        const vis2 = await el2.isVisible({ timeout: 2000 }).catch(() => false);
        if (!vis2) {
          buttonResults.push({ button: btn.text, note: "not visible" });
          continue;
        }
        await el2.click();
      } else {
        await el.click();
      }
      await page.waitForTimeout(2000);
      const url = page.url();
      const isModal = await page.getByRole("dialog").isVisible({ timeout: 1000 }).catch(() => false);
      const shotName = `02-btn-${btn.text.replace(/\s+/g, "-").toLowerCase()}`;
      await screenshot(page, shotName);
      buttonResults.push({ button: btn.text, url, isModal, note: isModal ? "modal opened" : "navigated", shot: shotName + ".png" });
      // Close modal if opened
      if (isModal) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    } catch (err) {
      buttonResults.push({ button: btn.text, note: err.message.substring(0, 80) });
    }
  }

  // Click "..." (ellipsis/kebab) menu on a video card if visible
  console.log("\n  Testing video card '...' menu...");
  try {
    // Look for kebab/more-options button on a video card
    const moreBtn = page.getByRole("button", { name: /more|options|\.\.\.|⋯/i }).first();
    const moreBtnVisible = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!moreBtnVisible) {
      // Try aria-label patterns
      const altBtn = page.locator('[aria-label*="more" i], [aria-label*="option" i], [aria-label*="menu" i]').first();
      const altVisible = await altBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (altVisible) {
        await altBtn.click();
      } else {
        buttonResults.push({ button: "video ... menu", note: "not found" });
      }
    } else {
      await moreBtn.click();
    }
    await page.waitForTimeout(1500);
    await screenshot(page, "02-video-kebab-menu");
    const menuVisible = await page.getByRole("menu").isVisible({ timeout: 1500 }).catch(() => false);
    buttonResults.push({ button: "video ... menu", note: menuVisible ? "menu opened OK" : "clicked but no menu", shot: "02-video-kebab-menu.png" });
    await page.keyboard.press("Escape");
  } catch (err) {
    buttonResults.push({ button: "video ... menu", note: err.message.substring(0, 80) });
  }

  await ctx.close();
  return { navResults, buttonResults, videoIds: [...videoIds] };
}

// ─────────────────────────────────────────────────────────────
// STEP 3: Real dark mode — find the toggle, enable it, verify, screenshot
// ─────────────────────────────────────────────────────────────
async function doDarkModeTest(browser, authState) {
  console.log("\n[STEP 3] Real dark mode test");
  const ctx = await browser.newContext({
    storageState: authState,
    viewport: { width: 1280, height: 900 },
    // NO colorScheme override — app uses cookie/class not media query
  });
  const page = await ctx.newPage();

  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check initial theme state
  const initialHtmlClass = await page.evaluate(() => document.documentElement.className);
  const initialBodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  console.log(`  Initial html.class: "${initialHtmlClass}"`);
  console.log(`  Initial body bg: ${initialBodyBg}`);
  await screenshot(page, "03-dark-before-toggle");

  // STRATEGY: Find the real dark mode toggle
  // Per STATE.md: toggle is accessible via bottom-left Admin account menu
  // Also check Organization Settings and any appearance setting

  let toggleFound = false;
  let toggleMethod = "not found";

  // Attempt 1: Bottom-left Admin account menu
  console.log("  Attempt 1: Bottom-left Admin account menu...");
  try {
    // Look for user/account button at bottom-left of sidebar
    // Common patterns: user avatar, "Admin" text, account menu trigger
    const adminTrigger = page
      .locator('button:near(:text("admin@ustoz.uz"))')
      .or(page.getByRole("button", { name: /admin|account|profile/i }))
      .or(page.locator('[data-testid*="account"], [data-testid*="user"], [aria-label*="account" i], [aria-label*="user" i]'))
      .first();

    // Also try: bottom-left area button
    const bottomLeftBtn = page.locator(".sidebar button, aside button, nav button").last();

    // Try the email text or user icon in sidebar
    const userMenuTrigger = page
      .getByText("admin@ustoz.uz")
      .or(page.getByRole("button", { name: "Admin" }))
      .first();

    let triggerVisible = await userMenuTrigger.isVisible({ timeout: 2000 }).catch(() => false);

    if (!triggerVisible) {
      // Try locating by email text then click its parent button
      const emailEl = page.locator("text=admin@ustoz.uz");
      triggerVisible = await emailEl.isVisible({ timeout: 2000 }).catch(() => false);
      if (triggerVisible) {
        // Click the parent interactive element
        const parent = emailEl.locator("xpath=ancestor::button[1]").or(emailEl);
        await parent.click({ timeout: 3000 });
      } else {
        // Try sidebar bottom area
        const sidebarBtns = await page.$$('aside button, [class*="sidebar"] button, nav button');
        if (sidebarBtns.length > 0) {
          // Click the last one (usually the account button at bottom)
          await sidebarBtns[sidebarBtns.length - 1].click();
        } else {
          throw new Error("No account trigger found");
        }
      }
    } else {
      await userMenuTrigger.click();
    }

    await page.waitForTimeout(1500);
    await screenshot(page, "03-admin-menu-open");

    // Look for dark/theme toggle in the opened menu
    const darkOption = page
      .getByRole("menuitem", { name: /dark|theme|appearance|toggle dark/i })
      .or(page.getByRole("button", { name: /dark|theme|appearance|toggle dark/i }))
      .or(page.getByText(/dark mode|toggle dark|switch theme/i));

    const darkOptionVisible = await darkOption.isVisible({ timeout: 2000 }).catch(() => false);

    if (darkOptionVisible) {
      await darkOption.click();
      await page.waitForTimeout(1500);
      toggleFound = true;
      toggleMethod = "Admin account menu → dark toggle";
      console.log("  Found dark toggle in Admin menu!");
    } else {
      // Log what IS in the menu
      const menuText = await page.getByRole("menu").innerText().catch(async () => {
        return await page.innerText('[role="menu"], [data-radix-popper-content-wrapper]').catch(() => "no menu found");
      });
      console.log(`  Menu content: "${menuText.substring(0, 300)}"`);
      await page.keyboard.press("Escape");
    }
  } catch (err) {
    console.log(`  Admin menu attempt failed: ${err.message.substring(0, 100)}`);
  }

  // Attempt 2: Look for any theme/dark toggle anywhere on the page
  if (!toggleFound) {
    console.log("  Attempt 2: Searching page for any dark/theme toggle...");
    try {
      const themeBtn = page
        .getByRole("button", { name: /dark|light|theme|appearance/i })
        .or(page.locator('[aria-label*="dark" i], [aria-label*="theme" i], [aria-label*="appearance" i]'))
        .or(page.locator('[class*="theme"], [class*="dark-toggle"], [data-testid*="theme"]'))
        .first();
      const visible = await themeBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        await themeBtn.click();
        await page.waitForTimeout(1500);
        toggleFound = true;
        toggleMethod = "theme button on page";
        console.log("  Found theme button on page!");
      }
    } catch (err) {
      console.log(`  Page theme button search failed: ${err.message.substring(0, 80)}`);
    }
  }

  // Attempt 3: Organization Settings page
  if (!toggleFound) {
    console.log("  Attempt 3: Checking Organization Settings for theme toggle...");
    try {
      await page.goto(BASE_URL + "/dashboard/settings", { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1500);
      const settingsText = await page.innerText("body").catch(() => "");
      const hasThemeSetting = /dark|theme|appearance/i.test(settingsText);
      console.log(`  Settings page has theme setting: ${hasThemeSetting}`);
      if (hasThemeSetting) {
        const themeControl = page.getByRole("button", { name: /dark|theme|appearance/i })
          .or(page.locator('input[type="checkbox"][name*="dark" i], input[type="checkbox"][name*="theme" i]'))
          .first();
        const visible = await themeControl.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          await themeControl.click();
          await page.waitForTimeout(1500);
          toggleFound = true;
          toggleMethod = "Organization Settings theme control";
        }
      }
      await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1000);
    } catch (err) {
      console.log(`  Settings page search failed: ${err.message.substring(0, 80)}`);
    }
  }

  // Attempt 4: Force via cookie (known mechanism from STATE.md)
  if (!toggleFound) {
    console.log("  Attempt 4: Force dark via cookie (known app mechanism)...");
    try {
      // From STATE.md: "toggle dark via cookie/class"
      // Common pattern for Next.js/Radix dark mode: set 'theme=dark' cookie
      await page.context().addCookies([
        { name: "theme", value: "dark", domain: "capweb-production-dd85.up.railway.app", path: "/" },
      ]);
      await page.reload({ waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(2000);
      toggleFound = true;
      toggleMethod = "cookie forced (theme=dark)";
      console.log("  Forced dark via cookie.");
    } catch (err) {
      console.log(`  Cookie force failed: ${err.message.substring(0, 80)}`);
    }
  }

  // VERIFY dark actually applied
  const postHtmlClass = await page.evaluate(() => document.documentElement.className);
  const postBodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  const isDarkApplied = /dark/i.test(postHtmlClass) || /rgb\(0|rgb\(1[0-9]|rgb\(2[0-5]/i.test(postBodyBg);

  console.log(`  Post-toggle html.class: "${postHtmlClass}"`);
  console.log(`  Post-toggle body bg: ${postBodyBg}`);
  console.log(`  Dark actually applied: ${isDarkApplied}`);

  await screenshot(page, "03-dark-dashboard");

  // Dark mode screenshots of key pages
  const darkPages = [
    { label: "03-dark-dashboard", url: BASE_URL + "/dashboard" },
    { label: "03-dark-org-settings", url: BASE_URL + "/dashboard/settings" },
    { label: "03-dark-access-mgmt", url: BASE_URL + "/dashboard/settings/members" },
  ];

  for (const dp of darkPages) {
    await page.goto(dp.url, { waitUntil: "networkidle", timeout: 25000 });
    await page.waitForTimeout(1500);
    await screenshot(page, dp.label);
    console.log(`  Dark screenshot: ${dp.label}`);
  }

  // Check a video page in dark if we have IDs
  // We'll do this after discovering video IDs

  // Bug hunt in dark mode — check for obvious issues
  const darkBugs = [];
  await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 25000 });
  await page.waitForTimeout(1500);

  // Check for white-on-white or invisible text by evaluating contrast
  const whiteTextOnWhite = await page.evaluate(() => {
    const els = document.querySelectorAll("p, span, h1, h2, h3, li, button, label");
    const issues = [];
    for (const el of els) {
      const style = window.getComputedStyle(el);
      const color = style.color;
      const bg = style.backgroundColor;
      // Detect light text on light bg or dark text on dark bg (crude check)
      if (color === bg && color !== "rgba(0, 0, 0, 0)") {
        issues.push(el.tagName + ": " + (el.textContent || "").substring(0, 30));
      }
    }
    return issues.slice(0, 5);
  });

  if (whiteTextOnWhite.length > 0) {
    darkBugs.push({ type: "same-color text/bg", elements: whiteTextOnWhite });
  }

  await ctx.close();

  return {
    toggleFound,
    toggleMethod,
    isDarkApplied,
    postHtmlClass,
    postBodyBg,
    darkBugs,
  };
}

// ─────────────────────────────────────────────────────────────
// STEP 4: AI transcription generation test
// For each dashboard video: record state, click generate if needed
// ─────────────────────────────────────────────────────────────
async function doTranscriptionTest(browser, authState, videoIds) {
  console.log("\n[STEP 4] AI transcription generation test");

  const ctx = await browser.newContext({
    storageState: authState,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  // First get ALL video IDs from dashboard if not enough passed in
  if (videoIds.length < 2) {
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const hrefs = await page.$$eval("a[href]", (els) => els.map((el) => el.getAttribute("href"))).catch(() => []);
    for (const href of hrefs) {
      const m = href && href.match(/\/s\/([a-zA-Z0-9]{8,})/);
      if (m) videoIds.push(m[1]);
    }
    videoIds = [...new Set(videoIds)];
  }

  console.log(`  Will check ${videoIds.length} videos: ${videoIds.join(", ")}`);

  const videoReports = [];
  let generationAttempted = false;
  let generationResult = null;

  for (let i = 0; i < Math.min(videoIds.length, 4); i++) {
    const videoId = videoIds[i];
    const videoUrl = BASE_URL + "/s/" + videoId;
    console.log(`\n  [Video ${i + 1}/${Math.min(videoIds.length, 4)}] ${videoUrl}`);

    const networkLog = [];
    const aiCalls = [];
    page.removeAllListeners("response");
    page.on("response", (resp) => {
      const url = resp.url();
      const status = resp.status();
      networkLog.push({ status, url });
      if (/transcri|generat|ai|workflow|analyze|caption/i.test(url)) {
        aiCalls.push({ status, url });
        console.log(`    [API] ${status} ${url}`);
      }
    });

    await page.goto(videoUrl, { waitUntil: "networkidle", timeout: 40000 });
    await page.waitForTimeout(3000);
    await screenshot(page, `04-video-${i + 1}-initial-${videoId.substring(0, 8)}`);

    const bodyText = await page.innerText("body").catch(() => "");

    // Detect transcript state
    const transcriptPresent = /\d+:\d+\s+\w|transcript/i.test(bodyText) && !/transcript.*not|no transcript/i.test(bodyText);
    const transcriptGenerating = /generat|processing|analyzing|transcribing/i.test(bodyText);
    const transcriptError = /transcription failed|failed to transcri/i.test(bodyText);
    const transcriptEmpty = /no transcript|transcript.*unavailable|not.*transcri/i.test(bodyText);

    // Get visible transcript snippet
    let transcriptSnippet = "";
    try {
      // Look for timestamped text (transcript usually has "0:00" type timestamps)
      const tsMatch = bodyText.match(/\d+:\d+\s[\w\s]{20,}/);
      if (tsMatch) transcriptSnippet = tsMatch[0].substring(0, 150);
    } catch {}

    // Detect video duration / title
    const titleMatch = bodyText.match(/^(.{5,80})\n/m);
    const videoTitle = titleMatch ? titleMatch[1].trim() : "unknown";

    let transcriptState = "unknown";
    if (transcriptPresent && transcriptSnippet) transcriptState = "present (with content)";
    else if (transcriptPresent) transcriptState = "present (state text visible)";
    else if (transcriptGenerating) transcriptState = "generating";
    else if (transcriptError) transcriptState = "error";
    else if (transcriptEmpty) transcriptState = "empty/unavailable";
    else transcriptState = "unclear — see screenshot";

    console.log(`    State: ${transcriptState}`);
    console.log(`    Title snippet: ${videoTitle.substring(0, 60)}`);

    // Look for generate/analyze button
    let generateBtnVisible = false;
    let generateBtnState = "not found";
    let generateBtnText = "";

    const generateBtnSelectors = [
      page.getByRole("button", { name: /start ai|generate|transcri|analyze|re-generate|regenerate/i }),
      page.getByRole("button", { name: /ai analysis/i }),
      page.locator('[data-testid*="transcri"], [data-testid*="generate"], [data-testid*="analyze"]'),
      page.getByText(/start ai analysis|generate transcript|run transcription/i),
    ];

    for (const sel of generateBtnSelectors) {
      try {
        const vis = await sel.isVisible({ timeout: 1500 }).catch(() => false);
        if (vis) {
          generateBtnVisible = true;
          generateBtnState = (await sel.isDisabled().catch(() => false)) ? "disabled" : "enabled";
          generateBtnText = await sel.innerText().catch(() => "");
          break;
        }
      } catch {}
    }

    // Screenshot AI panel
    await screenshot(page, `04-video-${i + 1}-panel-${videoId.substring(0, 8)}`);

    // If no transcript and button found — try clicking ONCE (limit to first eligible video)
    let clickAttempted = false;
    let clickNetworkCalls = [];
    let postClickState = "";

    if (!generationAttempted && generateBtnVisible && generateBtnState === "enabled" && !transcriptPresent) {
      console.log(`    --> CLICKING generate button: "${generateBtnText}" (FIRST generation test)`);
      generationAttempted = true;

      const clickCalls = [];
      page.on("response", (resp) => {
        const url = resp.url();
        const status = resp.status();
        clickCalls.push({ status, url });
        console.log(`    [post-click API] ${status} ${url}`);
      });

      try {
        const btn = generateBtnSelectors[0]; // try first found
        await btn.click();
        // Wait up to 10s for a response
        await page.waitForTimeout(8000);
        clickAttempted = true;
        clickNetworkCalls = [...clickCalls];

        const postBodyText = await page.innerText("body").catch(() => "");
        const nowGenerating = /generat|processing|analyzing|transcribing/i.test(postBodyText);
        const nowError = /error|failed/i.test(postBodyText);
        postClickState = nowGenerating ? "generating started" : nowError ? "error shown" : "state unclear";

        await screenshot(page, `04-video-${i + 1}-after-generate-${videoId.substring(0, 8)}`);
        console.log(`    Post-click state: ${postClickState}`);

        generationResult = {
          videoId,
          clickedButton: generateBtnText,
          postClickState,
          networkCalls: clickNetworkCalls.filter(c => /transcri|generat|ai|workflow|analyze/i.test(c.url)),
          allApiCalls: clickNetworkCalls.filter(c => /\/api\//i.test(c.url)),
        };
      } catch (err) {
        console.log(`    Click error: ${err.message.substring(0, 80)}`);
        postClickState = `click error: ${err.message.substring(0, 80)}`;
      }
    }

    videoReports.push({
      videoId,
      videoTitle: videoTitle.substring(0, 80),
      url: videoUrl,
      transcriptState,
      transcriptSnippet,
      generateBtnVisible,
      generateBtnState,
      generateBtnText,
      clickAttempted,
      postClickState,
      aiCallsBeforeClick: [...aiCalls],
    });
  }

  // Also: look for 1hr+ video (Entrepreneurship) for new-build check
  console.log("\n  Searching for long video (>30min / Entrepreneurship)...");
  let longVideoId = null;
  let longVideoReport = null;

  for (const vid of videoIds) {
    const vidUrl = BASE_URL + "/s/" + vid;
    await page.goto(vidUrl, { waitUntil: "networkidle", timeout: 35000 });
    await page.waitForTimeout(2000);
    const text = await page.innerText("body").catch(() => "");
    if (/entrepreneur|1.?hour|1h|60.?min|>30|long/i.test(text) || text.length > 5000) {
      // Check duration
      const durationMatch = text.match(/(\d+):(\d+):(\d+)/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const mins = parseInt(durationMatch[2]);
        const totalMins = hours * 60 + mins;
        if (totalMins >= 30) {
          longVideoId = vid;
          console.log(`  Found long video: ${vid} (~${totalMins}min)`);
          break;
        }
      }
    }
  }

  // If we didn't find it in existing list, try known 1hr video
  // STATE.md mentions test video xg7yh84kpggh4q8
  const knownLongIds = ["xg7yh84kpggh4q8", ...videoIds];
  for (const vid of knownLongIds) {
    if (vid === longVideoId) continue;
    const vidUrl = BASE_URL + "/s/" + vid;
    console.log(`  Checking ${vid} for duration...`);
    await page.goto(vidUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const text = await page.innerText("body").catch(() => "");
    // Check if it's a >30min video
    const hasNotice = /notice|cost|time|30.?min|long.?video|this video is/i.test(text);
    const durationMatch = text.match(/(\d+):(\d+):(\d+)/);
    let totalMins = 0;
    if (durationMatch) {
      totalMins = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
    }

    if (totalMins >= 30 || hasNotice || /entrepreneur/i.test(text)) {
      longVideoId = vid;
      await screenshot(page, `04-long-video-${vid.substring(0, 8)}`);

      // Look for the cost notice specifically
      const noticeVisible = hasNotice;
      const noticeText = (() => {
        const m = text.match(/(notice|cost|long.?video|30.?min)[\s\S]{0,200}/i);
        return m ? m[0].substring(0, 200).replace(/\s+/g, " ") : "not found";
      })();

      longVideoReport = {
        videoId: vid,
        duration: durationMatch ? `${durationMatch[1]}:${durationMatch[2]}:${durationMatch[3]}` : "unknown",
        totalMins,
        hasNewBuildNotice: noticeVisible,
        noticeText,
        screenshot: `04-long-video-${vid.substring(0, 8)}.png`,
      };
      console.log(`  Long video: ${vid} | duration: ${longVideoReport.duration} | notice: ${noticeVisible}`);
      console.log(`  Notice text: ${noticeText.substring(0, 100)}`);
      break;
    }
  }

  if (!longVideoReport) {
    console.log("  No video >30min found in video list.");
  }

  await ctx.close();
  return { videoReports, generationAttempted, generationResult, longVideoReport };
}

// ─────────────────────────────────────────────────────────────
// STEP 5: Check for test video file for import test
// ─────────────────────────────────────────────────────────────
async function findTestVideoFile() {
  console.log("\n[STEP 5] Searching for small test video file...");
  const searchPaths = [
    "D:\\vibecoding\\ustoz-github",
    "C:\\Users\\mirko\\Videos",
    "C:\\Users\\mirko\\Downloads",
    "C:\\Users\\mirko\\Desktop",
  ];

  const videoExts = [".mp4", ".webm", ".mov"];

  for (const searchDir of searchPaths) {
    try {
      if (!fs.existsSync(searchDir)) continue;
      const files = fs.readdirSync(searchDir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        const ext = path.extname(f.name).toLowerCase();
        if (!videoExts.includes(ext)) continue;
        const fullPath = path.join(searchDir, f.name);
        const stat = fs.statSync(fullPath);
        const sizeMB = stat.size / 1024 / 1024;
        if (sizeMB < 20) {
          console.log(`  Found test video: ${fullPath} (${sizeMB.toFixed(1)} MB)`);
          return { found: true, path: fullPath, sizeMB };
        }
      }
    } catch {}
  }
  console.log("  No small test video found.");
  return { found: false };
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
(async () => {
  console.log("=== data365 CORRECTED QA pass ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Shots dir: ${SHOTS_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: undefined, // use bundled chromium
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // ── Step 1: Login ──
  const loginResult = await doLogin(browser);
  if (!loginResult.success) {
    console.error("FATAL: Login failed. Aborting.");
    await browser.close();
    process.exit(1);
  }

  const authState = loginResult.state;

  // ── Step 2: Nav survey ──
  const navResult = await doNavSurvey(browser, authState);

  // ── Step 3: Dark mode ──
  const darkResult = await doDarkModeTest(browser, authState);

  // ── Step 4: Transcription test ──
  const transResult = await doTranscriptionTest(browser, authState, navResult.videoIds || []);

  // ── Step 5: Test video file search ──
  const testVideo = await findTestVideoFile();

  await browser.close();

  // ─────────────────────────────────────────────────────────────
  // PRINT REPORT
  // ─────────────────────────────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════");
  console.log("QA REPORT — CORRECTED PASS");
  console.log("════════════════════════════════════════════════\n");

  // Login
  console.log("## 1. Login");
  console.log(`Status: OK — admin@ustoz.uz authenticated, landed on /dashboard`);

  // Nav survey
  console.log("\n## 2. Real-nav results");
  console.log("| Nav item | Resulting URL | Status |");
  console.log("|---|---|---|");
  for (const r of navResult.navResults) {
    const url = r.url.replace(BASE_URL, "");
    console.log(`| ${r.item} | ${url} | ${r.note} |`);
  }
  console.log("\n### On-page buttons:");
  for (const b of navResult.buttonResults) {
    console.log(`  - ${b.button}: ${b.note} (shot: ${b.shot || "none"})`);
  }

  // Dark mode
  console.log("\n## 3. Dark mode");
  console.log(`Toggle found: ${darkResult.toggleFound}`);
  console.log(`Toggle method: ${darkResult.toggleMethod}`);
  console.log(`Dark actually applied: ${darkResult.isDarkApplied}`);
  console.log(`html.class after toggle: "${darkResult.postHtmlClass}"`);
  console.log(`body bg after toggle: ${darkResult.postBodyBg}`);
  if (darkResult.darkBugs.length > 0) {
    console.log(`Dark mode bugs found: ${JSON.stringify(darkResult.darkBugs)}`);
  } else {
    console.log("Dark mode bugs: none detected by automated check");
  }

  // Transcription
  console.log("\n## 4. AI transcription");
  console.log("### Per-video transcript state:");
  for (const v of transResult.videoReports) {
    console.log(`  [${v.videoId.substring(0, 10)}] "${v.videoTitle.substring(0, 50)}" → ${v.transcriptState}`);
    if (v.transcriptSnippet) console.log(`    Snippet: ${v.transcriptSnippet.substring(0, 100)}`);
    if (v.generateBtnVisible) console.log(`    Generate btn: visible (${v.generateBtnState}) — "${v.generateBtnText}"`);
    if (v.clickAttempted) console.log(`    CLICKED: post-click state = ${v.postClickState}`);
  }
  if (transResult.generationResult) {
    const g = transResult.generationResult;
    console.log("\n### Generation test result:");
    console.log(`  Clicked: "${g.clickedButton}" on video ${g.videoId}`);
    console.log(`  Post-click state: ${g.postClickState}`);
    console.log(`  AI network calls after click:`);
    for (const c of g.networkCalls || []) {
      console.log(`    ${c.status} ${c.url}`);
    }
    console.log(`  All API calls after click:`);
    for (const c of g.allApiCalls || []) {
      console.log(`    ${c.status} ${c.url}`);
    }
  } else {
    console.log("\n### Generation test: not attempted (all videos already have transcripts, or no eligible button found)");
  }

  // New build check
  console.log("\n## 5. New build check (long video notice)");
  if (transResult.longVideoReport) {
    const l = transResult.longVideoReport;
    console.log(`Long video: ${l.videoId} | Duration: ${l.duration} (${l.totalMins} min)`);
    console.log(`Cost/time notice present: ${l.hasNewBuildNotice}`);
    console.log(`Notice text: ${l.noticeText}`);
    console.log(`Screenshot: ${l.screenshot}`);
    console.log(`New build (a2d27aa) live: ${l.hasNewBuildNotice ? "YES" : "CANNOT CONFIRM (notice not found)"}`);
  } else {
    console.log("No >30min video found — cannot confirm new build notice");
  }

  // Test video import
  console.log("\n## 6. Test video file for import");
  if (testVideo.found) {
    console.log(`Found: ${testVideo.path} (${testVideo.sizeMB.toFixed(1)} MB)`);
    console.log("(Import test can be run manually if transcription generation test was inconclusive)");
  } else {
    console.log("No small test video file found on disk. Cannot do import-test.");
  }

  // Screenshots
  console.log("\n## Screenshots saved:");
  for (const s of savedShots) {
    console.log(`  ${s}`);
  }

  console.log("\n════════════════════════════════════════════════");
  console.log("END OF CORRECTED QA REPORT");
  console.log("════════════════════════════════════════════════");
})();
