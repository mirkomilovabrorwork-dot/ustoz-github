/**
 * Targeted follow-up QA — fills gaps from corrected pass:
 * 1. Click "Instructions" nav (it's a span/text, not role=link — fix the locator)
 * 2. Check 1hr video (fg7dpjtqz45qchg / Entrepreneurship) with auth for new-build cost notice
 * 3. Dark mode org-settings & access-mgmt with CORRECT URL and auth
 * 4. Check the Admin "..." menu at bottom-left for dark mode toggle
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
const SHOTS_DIR = "C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-shots2";
const ADMIN_EMAIL = "admin@ustoz.uz";
const ADMIN_PASSWORD = "UstozAdmin2026!";

async function screenshot(page, name) {
  const p = path.join(SHOTS_DIR, name + ".png");
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  [shot] ${name}.png`);
  return p;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  // ── Login and get auth state ──
  console.log("[LOGIN]");
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const loginPage = await loginCtx.newPage();
  await loginPage.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await loginPage.getByPlaceholder("tim@apple.com").fill(ADMIN_EMAIL);
  await loginPage.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await loginPage.getByRole("button", { name: "Sign in" }).click();
  await loginPage.waitForURL(/\/dashboard/, { timeout: 30000 });
  const authState = await loginCtx.storageState();
  console.log("  Login OK");
  await loginCtx.close();

  // ── TEST 1: Click "Instructions" nav — it IS a sidebar link (visible in screenshot) ──
  console.log("\n[TEST 1] Click Instructions nav");
  {
    const ctx = await browser.newContext({ storageState: authState, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // From dashboard screenshot: "Instructions" appears in the sidebar as text
    // Try multiple locator strategies including span text
    let clicked = false;
    let resultUrl = "";
    let is404 = false;

    // Strategy: locate by text content directly (not role=link)
    const strategies = [
      () => page.locator('a:has-text("Instructions")').first(),
      () => page.locator('nav a:has-text("Instructions")').first(),
      () => page.locator('aside a:has-text("Instructions")').first(),
      () => page.getByText("Instructions", { exact: true }).first(),
      () => page.locator('[href*="dashboard"]:has-text("Instructions")').first(),
      () => page.locator('text=Instructions').first(),
    ];

    for (let i = 0; i < strategies.length; i++) {
      const el = strategies[i]();
      const vis = await el.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`  Strategy ${i + 1}: visible=${vis}`);
      if (vis) {
        try {
          await el.click({ timeout: 5000 });
          await page.waitForTimeout(2000);
          resultUrl = page.url();
          const bodyText = await page.innerText("body").catch(() => "");
          is404 = /404|Oops/i.test(bodyText);
          clicked = true;
          await screenshot(page, "followup-instructions-nav");
          console.log(`  Clicked! URL: ${resultUrl} | 404: ${is404}`);
          break;
        } catch (err) {
          console.log(`  Strategy ${i + 1} click failed: ${err.message.substring(0, 60)}`);
        }
      }
    }

    if (!clicked) {
      // Log what's in the sidebar
      const sidebarHtml = await page.locator('aside, nav, [class*="sidebar"]').first().innerHTML().catch(() => "no sidebar found");
      console.log("  Sidebar HTML snippet:", sidebarHtml.substring(0, 500));
      await screenshot(page, "followup-instructions-notfound");
    }

    await ctx.close();
  }

  // ── TEST 2: Long video (1hr Entrepreneurship) — check for cost notice ──
  console.log("\n[TEST 2] Long video (1hr) cost notice check");
  {
    const ctx = await browser.newContext({ storageState: authState, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const apiCalls = [];
    page.on("response", (resp) => {
      if (/\/api\//i.test(resp.url())) apiCalls.push({ status: resp.status(), url: resp.url() });
    });

    // The 1hr video is fg7dpjtqz45qchg (seen in dashboard screenshot as "Entrepreneurship, Personal Dev...")
    const longVideoId = "fg7dpjtqz45qchg";
    const videoUrl = BASE_URL + "/s/" + longVideoId;
    console.log(`  Loading: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: "networkidle", timeout: 40000 });
    await page.waitForTimeout(3000);
    await screenshot(page, "followup-long-video-full");

    const bodyText = await page.innerText("body").catch(() => "");
    const title = await page.title().catch(() => "");

    // Look for the cost/time notice specifically
    // The new build (a2d27aa) adds a notice on the AI-analysis panel for videos >30min
    const hasNotice = /notice|cost|time|30.?min|long.?video|this.*video.*is/i.test(bodyText);
    const hasCostWords = /\$|cost|minute|budget|processing time/i.test(bodyText);
    const hasLongVideoWarning = /long video|longer video|estimated|may take/i.test(bodyText);

    // Extract snippet around any notice-like text
    const noticeMatch = bodyText.match(/(notice|cost|30.?min|long.?video|processing time|estimated)[\s\S]{0,300}/i);
    const noticeSnippet = noticeMatch ? noticeMatch[0].substring(0, 300).replace(/\s+/g, " ") : "not found";

    // Check video duration visible on page
    const durationMatch = bodyText.match(/(\d+):(\d+):(\d+)/);
    const duration = durationMatch ? durationMatch[0] : "not found in text";

    console.log(`  Title: ${title}`);
    console.log(`  Duration in text: ${duration}`);
    console.log(`  hasNotice: ${hasNotice}`);
    console.log(`  hasCostWords: ${hasCostWords}`);
    console.log(`  hasLongVideoWarning: ${hasLongVideoWarning}`);
    console.log(`  Notice snippet: ${noticeSnippet.substring(0, 150)}`);

    // Scroll to the AI analysis panel area
    try {
      const aiPanel = page.locator('[class*="ai"], [class*="transcript"], [class*="analysis"]').first();
      const vis = await aiPanel.isVisible({ timeout: 2000 }).catch(() => false);
      if (vis) await aiPanel.scrollIntoViewIfNeeded();
    } catch {}
    await page.waitForTimeout(1000);
    await screenshot(page, "followup-long-video-ai-panel");

    // Relevant API calls
    const relevantCalls = apiCalls.filter(c => /transcri|generat|ai|analyze/i.test(c.url));
    console.log("  Relevant API calls:", relevantCalls.length);
    for (const c of relevantCalls) console.log(`    ${c.status} ${c.url}`);

    await ctx.close();
  }

  // ── TEST 3: Dark mode — find and use Admin "..." button, then screenshot correct pages ──
  console.log("\n[TEST 3] Dark mode — Admin menu + correct dark page URLs");
  {
    const ctx = await browser.newContext({ storageState: authState, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // From dashboard screenshot: bottom-left shows "A Admin" with a "..." (three dots) button
    // Let's find it
    console.log("  Looking for Admin '...' menu at bottom-left...");

    let darkEnabled = false;

    // Try: click the "..." next to "Admin" label
    try {
      // The bottom-left shows: [A] Admin [...]
      // Try button near "Admin" text
      const adminText = page.getByText("Admin", { exact: true });
      const adminVisible = await adminText.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  "Admin" text visible: ${adminVisible}`);

      if (adminVisible) {
        // The "..." is typically a sibling button or the parent is clickable
        // Try clicking the "Admin" row area / its parent
        const parentEl = adminText.locator("xpath=ancestor::*[self::button or self::div[@role='button'] or self::a][1]");
        const parentVis = await parentEl.isVisible({ timeout: 2000 }).catch(() => false);
        if (parentVis) {
          await parentEl.click();
        } else {
          // Click the "..." (3-dot) button near "Admin"
          const threeDotsBtn = page.locator('button:near(:text("Admin"))').last();
          const dotVis = await threeDotsBtn.isVisible({ timeout: 2000 }).catch(() => false);
          if (dotVis) {
            await threeDotsBtn.click();
          } else {
            await adminText.click();
          }
        }
        await page.waitForTimeout(1500);
        await screenshot(page, "followup-admin-menu");

        // Check what appeared
        const menuText = await page.locator('[role="menu"], [data-radix-popper-content-wrapper], [class*="dropdown"]').first().innerText().catch(() => "no menu");
        console.log(`  Menu text: "${menuText.substring(0, 300)}"`);

        // Look for dark mode toggle
        const darkItem = page
          .getByRole("menuitem", { name: /dark|theme|appearance/i })
          .or(page.getByText(/dark mode|toggle dark/i, { exact: false }))
          .first();
        const darkVis = await darkItem.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  Dark toggle visible in menu: ${darkVis}`);

        if (darkVis) {
          await darkItem.click();
          await page.waitForTimeout(1500);
          darkEnabled = true;
          console.log("  Clicked dark mode toggle!");
        }
      }
    } catch (err) {
      console.log(`  Admin menu attempt error: ${err.message.substring(0, 100)}`);
    }

    // Check if dark was applied
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const isDark = /dark/i.test(htmlClass);
    console.log(`  html.class: "${htmlClass}" | isDark: ${isDark}`);
    console.log(`  body bg: ${bodyBg}`);

    // If not yet dark via the menu, check if the "..." button itself opens a dropdown with theme
    if (!isDark) {
      console.log("  Dark not applied via menu. Trying '...' button...");
      try {
        // From screenshot: there's an ellipsis button at the very bottom right of the sidebar
        const ellipsisBtn = page.locator('button[aria-label*="more" i], button:has(svg), [data-state]').last();
        // Just get all sidebar buttons
        const sidebarButtons = await page.$$('aside button, [class*="sidebar"] button');
        console.log(`  Found ${sidebarButtons.length} sidebar buttons`);
        if (sidebarButtons.length > 0) {
          const lastBtn = sidebarButtons[sidebarButtons.length - 1];
          await lastBtn.click();
          await page.waitForTimeout(1500);
          await screenshot(page, "followup-last-sidebar-btn");
          const menuText2 = await page.locator('[role="menu"], [data-radix-popper-content-wrapper]').first().innerText().catch(() => "no popup");
          console.log(`  Last sidebar btn popup: "${menuText2.substring(0, 200)}"`);
          const darkItem2 = page.getByText(/dark mode|toggle dark|dark theme/i, { exact: false }).first();
          const darkVis2 = await darkItem2.isVisible({ timeout: 2000 }).catch(() => false);
          if (darkVis2) {
            await darkItem2.click();
            await page.waitForTimeout(1500);
            darkEnabled = true;
            const htmlClass2 = await page.evaluate(() => document.documentElement.className);
            console.log(`  After clicking dark: html.class="${htmlClass2}"`);
          }
        }
      } catch (err) {
        console.log(`  Ellipsis attempt error: ${err.message.substring(0, 80)}`);
      }
    }

    // If found dark, screenshot the key pages
    const htmlClassFinal = await page.evaluate(() => document.documentElement.className);
    const isDarkFinal = /dark/i.test(htmlClassFinal);
    console.log(`  Dark final state: isDark=${isDarkFinal}, class="${htmlClassFinal}"`);

    if (isDarkFinal) {
      // Save state with dark cookie/class for other pages
      const darkState = await ctx.storageState();

      // Screenshot key pages
      const darkPages = [
        ["followup-dark-dashboard-real", BASE_URL + "/dashboard"],
        ["followup-dark-org-settings-real", BASE_URL + "/dashboard/settings/organization"],
        ["followup-dark-access-mgmt-real", BASE_URL + "/dashboard/admin/access"],
      ];
      for (const [name, url] of darkPages) {
        await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
        await page.waitForTimeout(1500);
        const cls = await page.evaluate(() => document.documentElement.className);
        console.log(`  ${name}: html.class="${cls}"`);
        await screenshot(page, name);
      }
    } else {
      console.log("  Could not enable dark via UI. Using forced cookie approach for screenshots...");
      // Force dark via cookie and capture
      await page.context().addCookies([
        { name: "theme", value: "dark", domain: "capweb-production-dd85.up.railway.app", path: "/" },
      ]);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const darkCls = await page.evaluate(() => document.documentElement.className);
      console.log(`  Cookie-forced html.class: "${darkCls}"`);
      await screenshot(page, "followup-dark-dashboard-cookie");

      // Check the correct org settings URL (not /dashboard/settings which 404s)
      await page.goto(BASE_URL + "/dashboard/settings/organization", { waitUntil: "networkidle", timeout: 25000 });
      await page.waitForTimeout(1500);
      const orgCls = await page.evaluate(() => document.documentElement.className);
      const orgBodyText = await page.innerText("body").catch(() => "");
      const orgIs404 = /404|Oops/i.test(orgBodyText);
      console.log(`  Org settings: isDark=${/dark/i.test(orgCls)}, 404=${orgIs404}`);
      await screenshot(page, "followup-dark-org-settings-cookie");

      await page.goto(BASE_URL + "/dashboard/admin/access", { waitUntil: "networkidle", timeout: 25000 });
      await page.waitForTimeout(1500);
      await screenshot(page, "followup-dark-access-mgmt-cookie");
    }

    await ctx.close();
  }

  await browser.close();
  console.log("\n[DONE] Follow-up complete.");
})();
