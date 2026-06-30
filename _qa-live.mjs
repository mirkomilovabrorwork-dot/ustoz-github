/**
 * Live QA script for data365 (capweb-production-dd85.up.railway.app)
 * Run from: D:\vibecoding\ustoz-github
 *   node _qa-live.mjs
 */

// Resolve @playwright/test from apps/web since this is a pnpm workspace
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load playwright from the app's node_modules
const _require = createRequire(join(__dirname, "apps/web/package.json"));
const { chromium, devices } = _require("@playwright/test");
import fs from "fs";
import path from "path";

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────
const BASE_URL = "https://capweb-production-dd85.up.railway.app";
const SHOTS_DIR =
  "C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-shots";
const ENV_FILE = "D:\\vibecoding\\ustoz-github\\.env";
// Production override — STATE.md line 107 documents the actual live admin password
const PROD_PASSWORD_OVERRIDE = "UstozAdmin2026!";

// Known video IDs to try
const KNOWN_IDS = ["2t4a58an7acz3bb", "e1n1p41tp308pas"];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function parseEnv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function shotPath(name) {
  return path.join(SHOTS_DIR, name + ".png");
}

const savedShots = [];
async function screenshot(page, name) {
  const p = shotPath(name);
  await page.screenshot({ path: p, fullPage: true });
  savedShots.push(p);
  console.log(`  [shot] ${name}.png`);
}

// Collect console errors and failed requests from a page
function attachListeners(page) {
  const consoleErrors = [];
  const failedRequests = [];
  const apiCalls = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("response", (resp) => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400) {
      failedRequests.push({ status, url });
    }
    if (/\/api\/(.*transcri|.*generat|.*ai)/i.test(url)) {
      apiCalls.push({ status, url });
    }
  });

  return { consoleErrors, failedRequests, apiCalls };
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
const report = {
  login: {},
  buildSanity: {},
  pages: [],
  aiTranscription: {},
  bugs: [],
};

async function tryLogin(browser, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const { consoleErrors, failedRequests } = attachListeners(page);

  try {
    await page.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
    await screenshot(page, "login-initial");

    // Fill form
    await page.getByPlaceholder("tim@apple.com").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for dashboard or error
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 30000 });
      await screenshot(page, "login-success");
      return { success: true, page, ctx, consoleErrors, failedRequests };
    } catch {
      await screenshot(page, "login-failed-" + email.replace(/@.*/, ""));
      const errorText = await page.getByText("Invalid email or password.").isVisible().catch(() => false);
      return { success: false, page, ctx, consoleErrors, failedRequests, errorVisible: errorText };
    }
  } catch (err) {
    await screenshot(page, "login-exception");
    return { success: false, error: String(err), page, ctx, consoleErrors, failedRequests };
  }
}

async function visitPage(browser, label, url, cookieState) {
  const modes = [
    { name: "desktop-light", viewport: { width: 1280, height: 800 }, colorScheme: "light" },
    { name: "desktop-dark", viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
    { name: "mobile-light", viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true },
    { name: "mobile-dark", viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true },
  ];

  const pageReport = { page: label, url, modes: [] };

  for (const mode of modes) {
    const ctxOptions = {
      viewport: mode.viewport,
      colorScheme: mode.colorScheme,
      storageState: cookieState,
    };
    if (mode.isMobile) ctxOptions.userAgent = devices["iPhone 13"].userAgent;

    const ctx = await browser.newContext(ctxOptions);
    const pg = await ctx.newPage();
    const { consoleErrors, failedRequests } = attachListeners(pg);

    try {
      await pg.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      // Extra wait for hydration
      await pg.waitForTimeout(2000);
    } catch (err) {
      console.log(`  [warn] ${label} ${mode.name} navigation error: ${err.message}`);
    }

    const shotName = `${label}-${mode.name}`;
    await screenshot(pg, shotName);

    pageReport.modes.push({
      mode: mode.name,
      consoleErrors: [...consoleErrors],
      failedRequests: [...failedRequests],
    });

    await ctx.close();
  }

  report.pages.push(pageReport);
  return pageReport;
}

async function runAICheck(browser, videoId, cookieState) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    storageState: cookieState,
  });
  const pg = await ctx.newPage();
  const aiNetworkCalls = [];
  const consoleErrors = [];

  pg.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  pg.on("response", (resp) => {
    const url = resp.url();
    const status = resp.status();
    if (/\/api\//i.test(url)) {
      if (/transcri|generat|ai|workflow|caption/i.test(url)) {
        aiNetworkCalls.push({ status, url });
      } else if (status >= 400) {
        aiNetworkCalls.push({ status, url, note: "non-ai 4xx" });
      }
    }
  });

  const videoUrl = `${BASE_URL}/s/${videoId}`;
  console.log(`\n[AI check] Loading ${videoUrl}`);
  await pg.goto(videoUrl, { waitUntil: "networkidle", timeout: 40000 });
  await pg.waitForTimeout(3000);
  await screenshot(pg, `ai-check-video-initial-${videoId}`);

  // Observe transcript/AI panel state
  const pageText = await pg.innerText("body").catch(() => "");
  const hasTranscript = /transcript/i.test(pageText);
  const isGenerating = /generat|processing|analyzing|loading/i.test(pageText);
  const hasError = /error|failed|unavailable/i.test(pageText);
  const hasBudget = /budget|cost|minute|credit/i.test(pageText);

  // Look for transcription-related visible text blocks
  const transcriptSnippet = (() => {
    const m = pageText.match(/transcript[\s\S]{0,500}/i);
    return m ? m[0].substring(0, 300).replace(/\s+/g, " ").trim() : null;
  })();

  // Look for AI start button
  let startButtonVisible = false;
  let startButtonState = "not found";
  try {
    const btn = pg.getByRole("button", { name: /start ai|generate|transcri|analyze/i });
    startButtonVisible = await btn.isVisible({ timeout: 3000 });
    if (startButtonVisible) {
      startButtonState = (await btn.isDisabled()) ? "disabled" : "enabled";
    }
  } catch {}

  await screenshot(pg, `ai-check-video-panel-${videoId}`);

  // If there's a "Start AI analysis" button and no transcript, click it ONCE
  let clickedStart = false;
  let postClickNetworkCalls = [];
  if (startButtonVisible && startButtonState === "enabled" && !hasTranscript) {
    console.log(`  [AI] Clicking "Start AI analysis" once on video ${videoId}`);
    const postClickCalls = [];
    pg.on("response", (resp) => {
      if (/\/api\//i.test(resp.url())) {
        postClickCalls.push({ status: resp.status(), url: resp.url() });
      }
    });
    try {
      const btn = pg.getByRole("button", { name: /start ai|generate|transcri|analyze/i });
      await btn.click();
      await pg.waitForTimeout(5000); // observe resulting network activity
      clickedStart = true;
      postClickNetworkCalls = [...postClickCalls];
      await screenshot(pg, `ai-check-after-click-${videoId}`);
    } catch (err) {
      console.log(`  [AI] Click error: ${err.message}`);
    }
  }

  // Also check the /api/video endpoint if visible
  // Capture everything about the panel
  const aiReport = {
    videoId,
    videoUrl,
    hasTranscript,
    isGenerating,
    hasError,
    hasBudget,
    transcriptSnippet,
    startButtonVisible,
    startButtonState,
    clickedStart,
    networkCallsBeforeClick: [...aiNetworkCalls],
    networkCallsAfterClick: postClickNetworkCalls,
    consoleErrors,
  };

  await ctx.close();
  return aiReport;
}

// Check for new features (long-video cost notice, per-video budget)
function detectNewFeatures(pageText) {
  const budgetKeywords = /budget|cost|time notice|30.?min|long.?video/i;
  return budgetKeywords.test(pageText);
}

(async () => {
  console.log("=== data365 Live QA ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Shots dir: ${SHOTS_DIR}\n`);

  // Parse credentials — .env has local dev password; prod uses the Railway-seeded value
  const env = parseEnv(ENV_FILE);
  const adminEmail = env.INITIAL_ADMIN_EMAIL || "admin@ustoz.uz";
  const adminPassword = PROD_PASSWORD_OVERRIDE || env.INITIAL_ADMIN_PASSWORD;
  const fallbackEmail = "admin@data365.co";

  const browser = await chromium.launch({ headless: true });

  // ── 1. Login ──
  console.log("[1] Attempting login with primary email:", adminEmail);
  let loginResult = await tryLogin(browser, adminEmail, adminPassword);

  if (!loginResult.success) {
    console.log("  Primary login failed. Trying fallback:", fallbackEmail);
    await loginResult.ctx.close();
    loginResult = await tryLogin(browser, fallbackEmail, adminPassword);
    if (!loginResult.success) {
      console.log("  Both logins failed.");
      report.login = { success: false, tried: [adminEmail, fallbackEmail], result: loginResult };
      await browser.close();
      printReport();
      process.exit(1);
    } else {
      report.login = { success: true, email: fallbackEmail };
    }
  } else {
    report.login = { success: true, email: adminEmail };
  }

  console.log(`  Login SUCCESS with ${report.login.email}`);

  // Save cookie state for reuse
  const cookieState = await loginResult.ctx.storageState();
  const statePath = path.join(SHOTS_DIR, "_auth-state.json");
  fs.writeFileSync(statePath, JSON.stringify(cookieState));

  // ── 2. Smoke: dashboard + collect video IDs ──
  console.log("\n[2] Smoke check: /dashboard");
  const dashPage = loginResult.page;
  await dashPage.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 30000 });
  await dashPage.waitForTimeout(2000);
  const dashText = await dashPage.innerText("body").catch(() => "");
  await screenshot(dashPage, "smoke-dashboard");

  // Try to extract video IDs from the page
  const idRegex = /\/s\/([a-z0-9]{10,})/g;
  const foundIds = new Set(KNOWN_IDS);
  let m;
  while ((m = idRegex.exec(dashText)) !== null) {
    foundIds.add(m[1]);
  }
  // Also search for IDs in hrefs
  const hrefs = await dashPage.$$eval("a[href]", (els) =>
    els.map((el) => el.getAttribute("href"))
  ).catch(() => []);
  for (const href of hrefs) {
    const hm = href && href.match(/\/s\/([a-z0-9]{10,})/);
    if (hm) foundIds.add(hm[1]);
  }

  const videoIds = [...foundIds].slice(0, 3);
  console.log("  Video IDs found:", videoIds);

  report.buildSanity = {
    dashboardLoaded: dashText.length > 100,
    videoIds,
    newFeaturesDetected: detectNewFeatures(dashText),
    dashboardTextSnippet: dashText.substring(0, 500).replace(/\s+/g, " ").trim(),
  };

  await loginResult.ctx.close();

  // ── 3. 4-mode sweep ──
  console.log("\n[3] 4-mode page sweep...");
  const pagesToTest = [
    { label: "dashboard", url: BASE_URL + "/dashboard" },
    { label: "video-0", url: BASE_URL + "/s/" + videoIds[0] },
    { label: "settings", url: BASE_URL + "/dashboard/settings" },
    { label: "org-admin", url: BASE_URL + "/dashboard/admin" },
  ];

  if (videoIds[1]) {
    pagesToTest.splice(2, 0, { label: "video-1", url: BASE_URL + "/s/" + videoIds[1] });
  }

  for (const p of pagesToTest) {
    console.log(`\n  Sweeping: ${p.label} (${p.url})`);
    await visitPage(browser, p.label, p.url, cookieState);
  }

  // Also check /dashboard/caps and /dashboard/spaces as alternate nav paths
  for (const sub of ["/dashboard/caps", "/dashboard/spaces"]) {
    const label = sub.replace("/dashboard/", "dash-");
    console.log(`\n  Extra: ${label}`);
    await visitPage(browser, label, BASE_URL + sub, cookieState);
  }

  // ── 4. AI transcription check ──
  console.log("\n[4] AI transcription check...");
  report.aiTranscription = await runAICheck(browser, videoIds[0], cookieState);

  // If first video's transcript status is inconclusive, also check second ID
  if (videoIds[1] && videoIds[0] !== videoIds[1]) {
    console.log(`  Also checking video ${videoIds[1]}...`);
    const ai2 = await runAICheck(browser, videoIds[1], cookieState);
    report.aiTranscription.secondVideo = ai2;
  }

  await browser.close();

  printReport();
})();

function printReport() {
  console.log("\n\n========================================");
  console.log("QA REPORT");
  console.log("========================================\n");

  // Login
  console.log("## Login");
  if (report.login.success) {
    console.log(`SUCCESS — email: ${report.login.email}`);
  } else {
    console.log(`FAILED — tried: ${report.login.tried?.join(", ")}`);
    console.log("  Error:", JSON.stringify(report.login.result));
  }

  // Build sanity
  console.log("\n## Build Sanity");
  console.log(`Dashboard loaded: ${report.buildSanity.dashboardLoaded}`);
  console.log(`Video IDs: ${report.buildSanity.videoIds}`);
  console.log(`New features detected: ${report.buildSanity.newFeaturesDetected}`);
  console.log(`Dashboard text snippet: ${report.buildSanity.dashboardTextSnippet}`);

  // Per-page findings
  console.log("\n## Per-page Findings");
  for (const pg of report.pages) {
    console.log(`\n### ${pg.page} (${pg.url})`);
    for (const mode of pg.modes) {
      const errs = mode.consoleErrors.length;
      const fails = mode.failedRequests.length;
      console.log(`  [${mode.mode}] console errors: ${errs} | failed requests: ${fails}`);
      if (errs > 0) console.log(`    Console: ${mode.consoleErrors.slice(0, 3).join(" | ")}`);
      if (fails > 0) console.log(`    Failed: ${mode.failedRequests.slice(0, 5).map((r) => `${r.status} ${r.url}`).join(" | ")}`);
    }
  }

  // AI transcription
  console.log("\n## AI Transcription");
  const ai = report.aiTranscription;
  if (ai.videoId) {
    console.log(`Video: ${ai.videoUrl}`);
    console.log(`hasTranscript: ${ai.hasTranscript}`);
    console.log(`isGenerating: ${ai.isGenerating}`);
    console.log(`hasError: ${ai.hasError}`);
    console.log(`hasBudget: ${ai.hasBudget}`);
    console.log(`transcriptSnippet: ${ai.transcriptSnippet}`);
    console.log(`startButton: visible=${ai.startButtonVisible}, state=${ai.startButtonState}`);
    console.log(`clickedStart: ${ai.clickedStart}`);
    console.log(`networkCallsBeforeClick (${ai.networkCallsBeforeClick?.length}):`);
    for (const c of (ai.networkCallsBeforeClick || []).slice(0, 10)) {
      console.log(`  ${c.status} ${c.url}`);
    }
    console.log(`networkCallsAfterClick (${ai.networkCallsAfterClick?.length}):`);
    for (const c of (ai.networkCallsAfterClick || []).slice(0, 10)) {
      console.log(`  ${c.status} ${c.url}`);
    }
    if (ai.consoleErrors?.length > 0) {
      console.log(`consoleErrors: ${ai.consoleErrors.slice(0, 5).join(" | ")}`);
    }
    if (ai.secondVideo) {
      console.log(`\nSecond video (${ai.secondVideo.videoId}):`);
      console.log(`  hasTranscript: ${ai.secondVideo.hasTranscript}`);
      console.log(`  isGenerating: ${ai.secondVideo.isGenerating}`);
      console.log(`  hasError: ${ai.secondVideo.hasError}`);
      console.log(`  startButton: ${ai.secondVideo.startButtonVisible}, state: ${ai.secondVideo.startButtonState}`);
      console.log(`  networkCalls (${ai.secondVideo.networkCallsBeforeClick?.length}):`);
      for (const c of (ai.secondVideo.networkCallsBeforeClick || []).slice(0, 10)) {
        console.log(`    ${c.status} ${c.url}`);
      }
    }
  }

  // Screenshots
  console.log("\n## Screenshots Saved");
  for (const s of savedShots) {
    console.log(`  ${s}`);
  }

  console.log("\n========================================");
  console.log("END OF REPORT");
  console.log("========================================");
}
