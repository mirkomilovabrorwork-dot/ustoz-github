/**
 * Final targeted checks:
 * 1. Instructions nav — get its href and navigate directly to verify it works
 * 2. Long video (1hr) — scroll the AI panel, check for the >30min cost notice specifically
 * 3. Dark mode toggle — confirm it's the "Toggle Dark Mode" menu item, click it, verify class changes
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(join(__dirname, "apps/web/package.json"));
const { chromium } = _require("@playwright/test");
import path from "path";

const BASE_URL = "https://capweb-production-dd85.up.railway.app";
const SHOTS_DIR = "C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-shots2";
const ADMIN_EMAIL = "admin@ustoz.uz";
const ADMIN_PASSWORD = "UstozAdmin2026!";

async function screenshot(page, name) {
  const p = path.join(SHOTS_DIR, name + ".png");
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  [shot] ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  // Login
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const loginPage = await loginCtx.newPage();
  await loginPage.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await loginPage.getByPlaceholder("tim@apple.com").fill(ADMIN_EMAIL);
  await loginPage.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await loginPage.getByRole("button", { name: "Sign in" }).click();
  await loginPage.waitForURL(/\/dashboard/, { timeout: 30000 });
  const authState = await loginCtx.storageState();
  await loginCtx.close();
  console.log("Login OK");

  // ── TEST 1: Instructions link ──
  console.log("\n[TEST 1] Instructions link — get href, navigate directly");
  {
    const ctx = await browser.newContext({ storageState: authState, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get the href of the Instructions link
    const href = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const link = links.find(a => a.textContent.trim().includes("Instructions"));
      return link ? link.href : null;
    });
    console.log(`  Instructions href: ${href}`);

    if (href) {
      // Navigate directly to it
      await page.goto(href, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const url = page.url();
      const title = await page.title().catch(() => "");
      const bodyText = await page.innerText("body").catch(() => "");
      const is404 = /404|Oops/i.test(bodyText);
      console.log(`  Navigated to: ${url}`);
      console.log(`  Title: ${title}`);
      console.log(`  Is 404: ${is404}`);
      await screenshot(page, "final-instructions-page");
    } else {
      console.log("  No href found for Instructions");
      await screenshot(page, "final-instructions-no-href");
    }
    await ctx.close();
  }

  // ── TEST 2: Long video (1hr) — check entire right panel text ──
  console.log("\n[TEST 2] Long video (1hr) — full right panel scan for cost notice");
  {
    const ctx = await browser.newContext({ storageState: authState, viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL + "/s/fg7dpjtqz45qchg", { waitUntil: "networkidle", timeout: 40000 });
    await page.waitForTimeout(3000);

    // Get the full page text
    const fullText = await page.innerText("body").catch(() => "");
    console.log("  Full page text (first 2000 chars):");
    console.log("  " + fullText.substring(0, 2000).replace(/\n/g, "\n  "));

    // Specifically look for the >30 min notice (new build feature from a2d27aa)
    // The notice would be in the AI analysis panel for videos >30 min
    const noticeKeywords = ["30 min", "30min", "long video", "notice", "estimated time", "may take longer", "processing time", "large video"];
    for (const kw of noticeKeywords) {
      const idx = fullText.toLowerCase().indexOf(kw.toLowerCase());
      if (idx >= 0) {
        console.log(`  Found keyword "${kw}" at position ${idx}:`);
        console.log(`  Context: "${fullText.substring(Math.max(0, idx-50), idx+150)}"`);
      }
    }

    // Get the right panel specifically
    const rightPanel = await page.evaluate(() => {
      // Look for elements that might be the cost/AI panel on the right
      const panels = document.querySelectorAll('[class*="panel"], [class*="sidebar"], aside, [class*="right"], [class*="cost"], [class*="ai"]');
      const texts = [];
      for (const p of panels) {
        const t = p.innerText || p.textContent;
        if (t && t.trim().length > 10) {
          texts.push(`[${p.tagName}.${p.className.substring(0, 30)}]: ${t.substring(0, 200)}`);
        }
      }
      return texts.slice(0, 5);
    });
    console.log("  Right panel elements:");
    for (const p of rightPanel) console.log("  " + p.substring(0, 200));

    await screenshot(page, "final-long-video-scrolled");

    // Try scrolling to the AI panel / right side
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    await screenshot(page, "final-long-video-scrolled-mid");

    await ctx.close();
  }

  // ── TEST 3: Dark mode toggle — verify class/cookie changes ──
  console.log("\n[TEST 3] Dark mode — click Toggle Dark Mode, verify html class or cookie changes");
  {
    const ctx = await browser.newContext({ storageState: authState, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const classBefore = await page.evaluate(() => document.documentElement.className);
    const bgBefore = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    console.log(`  BEFORE: class="${classBefore}", bg=${bgBefore}`);

    // Click Admin text to open menu
    const adminText = page.getByText("Admin", { exact: true });
    await adminText.click();
    await page.waitForTimeout(1000);

    // Click "Toggle Dark Mode"
    const toggleItem = page.getByText("Toggle Dark Mode", { exact: true });
    const toggleVis = await toggleItem.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  "Toggle Dark Mode" visible: ${toggleVis}`);

    if (toggleVis) {
      await toggleItem.click();
      await page.waitForTimeout(2000);

      const classAfter = await page.evaluate(() => document.documentElement.className);
      const bgAfter = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);

      // Also check cookies
      const cookies = await ctx.cookies();
      const themeCookie = cookies.find(c => c.name.toLowerCase().includes("theme") || c.name.toLowerCase().includes("dark"));
      console.log(`  AFTER: class="${classAfter}", bg=${bgAfter}`);
      console.log(`  Theme cookie: ${JSON.stringify(themeCookie)}`);
      console.log(`  All cookies: ${cookies.map(c => c.name + "=" + c.value).join(", ")}`);

      const isDark = /dark/i.test(classAfter) || (bgAfter !== bgBefore && /rgb\([0-2][0-9]|rgb\([0-9], [0-9]|rgb\(1[0-5]/.test(bgAfter));
      console.log(`  Dark applied: ${isDark}`);

      await screenshot(page, "final-dark-after-toggle");

      // If dark applied, screenshot the org-settings and access-management in real dark
      if (isDark || classAfter !== classBefore) {
        for (const [name, url] of [
          ["final-dark-real-org-settings", BASE_URL + "/dashboard/settings/organization"],
          ["final-dark-real-access-mgmt", BASE_URL + "/dashboard/admin/access"],
        ]) {
          await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
          await page.waitForTimeout(1500);
          const cls = await page.evaluate(() => document.documentElement.className);
          const bg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
          console.log(`  ${name}: class="${cls}", bg=${bg}`);
          await screenshot(page, name);
        }
      }
    }

    await ctx.close();
  }

  await browser.close();
  console.log("\n[DONE]");
})();
