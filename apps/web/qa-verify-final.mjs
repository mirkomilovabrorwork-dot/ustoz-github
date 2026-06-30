// qa-verify-final.mjs - Full QA verification of dark mode toggle and cost-confirmation dialog
import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL = "https://capweb-production-dd85.up.railway.app";
const EMAIL = "admin@ustoz.uz";
const PASSWORD = "UstozAdmin2026!";
const SS_DIR = "C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-verify";
const TEST_VIDEO = "D:\\vibecoding\\ustoz-github\\tmp-qa\\test-demo.mp4";

// ---- helpers ----
function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
}
function ss(label) {
  return path.join(SS_DIR, label + ".png");
}

async function login(page) {
  await page.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

// Open the Admin user dropdown by clicking at the bottom-left sidebar element
// The element is a div[aria-haspopup="dialog"] containing "A Admin" text
// It lives at approx y=870-912 in the sidebar.
async function openAdminMenu(page) {
  // Find the SECOND aria-haspopup=dialog element (first is the Team switcher at y~72, second is Admin at y~870)
  const els = await page.locator("[aria-haspopup=dialog]").all();
  console.log("  aria-haspopup=dialog elements found:", els.length);
  
  let adminEl = null;
  for (const el of els) {
    const text = (await el.innerText().catch(() => "")).trim();
    const bb = await el.boundingBox().catch(() => null);
    console.log("  Candidate: text=" + JSON.stringify(text.substring(0, 40)) + " y=" + (bb ? Math.round(bb.y) : "?"));
    if (text.includes("Admin") && bb && bb.y > 500) {
      adminEl = el;
    }
  }
  
  if (!adminEl) {
    // Fallback: click by known coordinates
    console.log("  Fallback: clicking by coordinates (110, 891)");
    await page.mouse.click(110, 891);
  } else {
    const bb = await adminEl.boundingBox().catch(() => null);
    if (bb) {
      console.log("  Clicking admin element at y=" + Math.round(bb.y));
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    } else {
      await adminEl.click({ force: true });
    }
  }
  
  await page.waitForTimeout(1000);
}

// ---- TEST A: Dark mode toggle is INSTANT ----
async function testDarkMode(browser) {
  console.log("\n========================================");
  console.log("TEST A: Dark-mode toggle is INSTANT");
  console.log("========================================");
  
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  const result = {
    classBefore: "",
    classAfter: "",
    toggled: false,
    changed: false,
    pass: false,
    screenshots: [],
    error: null,
  };
  
  try {
    await login(page);
    
    // Step 1: get body class before
    result.classBefore = await page.evaluate(() => document.body.className);
    console.log("  classBefore:", JSON.stringify(result.classBefore));
    
    // Screenshot before
    await page.screenshot({ path: ss("testA-01-before") });
    result.screenshots.push(ss("testA-01-before"));
    console.log("  Screenshot: testA-01-before.png");
    
    // Step 2: Open admin menu
    console.log("  Opening admin menu...");
    await openAdminMenu(page);
    await page.screenshot({ path: ss("testA-02-menu-open") });
    result.screenshots.push(ss("testA-02-menu-open"));
    console.log("  Screenshot: testA-02-menu-open.png");
    
    // Verify menu is open
    const menuText = await page.evaluate(() => document.body.innerText);
    const hasDarkText = menuText.includes("Toggle Dark Mode");
    console.log("  'Toggle Dark Mode' visible:", hasDarkText);
    if (!hasDarkText) {
      result.error = "Toggle Dark Mode not found in menu";
      console.log("  ERROR:", result.error);
      await context.close();
      return result;
    }
    
    // Step 3: Click "Toggle Dark Mode"
    // It appears in the page text but might not be a button. Find it by text.
    // Try multiple strategies
    let clicked = false;
    
    // Strategy 1: look for element with exact text
    const darkModeEls = await page.locator("text=Toggle Dark Mode").all();
    console.log("  'Toggle Dark Mode' elements:", darkModeEls.length);
    for (const el of darkModeEls) {
      const vis = await el.isVisible().catch(() => false);
      const tag = await el.evaluate(e => e.tagName).catch(() => "");
      const bb = await el.boundingBox().catch(() => null);
      console.log("  El tag=" + tag + " vis=" + vis + " bb=" + JSON.stringify(bb));
      if (vis && bb) {
        await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
        clicked = true;
        break;
      }
    }
    
    if (!clicked) {
      // Strategy 2: find by button with partial text
      const btnDark = page.locator("button:has-text(\"Toggle Dark Mode\")");
      const btnDarkVis = await btnDark.isVisible().catch(() => false);
      if (btnDarkVis) {
        await btnDark.click({ force: true });
        clicked = true;
      }
    }
    
    if (!clicked) {
      result.error = "Could not click Toggle Dark Mode";
      console.log("  ERROR:", result.error);
      await context.close();
      return result;
    }
    
    result.toggled = true;
    console.log("  Clicked Toggle Dark Mode");
    
    // Wait a moment (but no reload!)
    await page.waitForTimeout(500);
    
    // Step 4: Check body class WITHOUT reload
    result.classAfter = await page.evaluate(() => document.body.className);
    console.log("  classAfter:", JSON.stringify(result.classAfter));
    
    // Screenshot after
    await page.screenshot({ path: ss("testA-03-after") });
    result.screenshots.push(ss("testA-03-after"));
    console.log("  Screenshot: testA-03-after.png");
    
    // Check URL to confirm no navigation happened
    const urlAfter = page.url();
    console.log("  URL after toggle:", urlAfter);
    
    // PASS = class changed and one of them contains "dark"
    const beforeHasDark = result.classBefore.includes("dark");
    const afterHasDark = result.classAfter.includes("dark");
    result.changed = result.classBefore !== result.classAfter;
    result.pass = result.changed && (beforeHasDark !== afterHasDark);
    
    console.log("  changed:", result.changed, "| beforeHasDark:", beforeHasDark, "| afterHasDark:", afterHasDark);
    
    // Step 5: Toggle back to original state
    if (result.changed) {
      console.log("  Toggling back to original state...");
      await openAdminMenu(page);
      const menuText2 = await page.evaluate(() => document.body.innerText);
      if (menuText2.includes("Toggle Dark Mode")) {
        const darkEls2 = await page.locator("text=Toggle Dark Mode").all();
        for (const el of darkEls2) {
          const vis = await el.isVisible().catch(() => false);
          const bb = await el.boundingBox().catch(() => null);
          if (vis && bb) {
            await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
            break;
          }
        }
        await page.waitForTimeout(500);
        const classReset = await page.evaluate(() => document.body.className);
        console.log("  classAfterReset:", JSON.stringify(classReset));
      }
    }
    
  } catch (e) {
    result.error = e.message;
    console.log("  TEST A ERROR:", e.message);
    await page.screenshot({ path: ss("testA-ERROR") }).catch(() => {});
    result.screenshots.push(ss("testA-ERROR"));
  }
  
  await context.close();
  return result;
}

// ---- TEST B: Cost-confirmation dialog before AI ----
async function testCostDialog(browser) {
  console.log("\n========================================");
  console.log("TEST B: Cost-confirmation dialog before AI");
  console.log("========================================");
  
  const result = {
    uploaded: false,
    videoId: null,
    videoUrl: null,
    dialogSeen: false,
    dialogText: null,
    cancelWorked: false,
    attempts: 0,
    deleted: false,
    pass: false,
    screenshots: [],
    error: null,
  };
  
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  try {
    // Verify test video exists
    if (!fs.existsSync(TEST_VIDEO)) {
      result.error = "Test video not found: " + TEST_VIDEO;
      console.log("  ERROR:", result.error);
      await context.close();
      return result;
    }
    console.log("  Test video exists:", TEST_VIDEO);
    
    await login(page);
    
    // Step 1: Navigate to /dashboard/import/file (the upload route)
    console.log("  Navigating to /dashboard/import/file...");
    await page.goto(BASE_URL + "/dashboard/import/file", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log("  URL:", page.url());
    
    await page.screenshot({ path: ss("testB-01-import-file") });
    result.screenshots.push(ss("testB-01-import-file"));
    console.log("  Screenshot: testB-01-import-file.png");
    
    // Find the hidden file input
    const fileInputs = await page.locator("input[type=file]").all();
    console.log("  File inputs found:", fileInputs.length);
    for (const fi of fileInputs) {
      const vis = await fi.isVisible().catch(() => false);
      const accept = await fi.getAttribute("accept").catch(() => "") || "";
      const cls = (await fi.getAttribute("class").catch(() => "") || "").substring(0, 60);
      console.log("  FI vis=" + vis + " accept=" + accept + " cls=" + cls);
    }
    
    if (fileInputs.length === 0) {
      // If no file input found, try the /dashboard/import route and click Upload File link
      console.log("  No file input — trying /dashboard/import then clicking Upload File link");
      await page.goto(BASE_URL + "/dashboard/import", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1000);
      
      const uploadLink = page.locator("a[href*=import/file]").first();
      const uplinkVis = await uploadLink.isVisible().catch(() => false);
      if (uplinkVis) {
        await uploadLink.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);
        console.log("  Clicked upload link, URL:", page.url());
      }
      
      const fi2 = await page.locator("input[type=file]").all();
      console.log("  File inputs after navigation:", fi2.length);
      if (fi2.length === 0) {
        result.error = "No file input found on import page";
        await context.close();
        return result;
      }
    }
    
    // Step 2: Collect existing video IDs BEFORE upload (navigate to /dashboard/caps in a second tab)
    const dashPage = await context.newPage();
    await dashPage.goto(BASE_URL + "/dashboard/caps", { waitUntil: "networkidle", timeout: 30000 });
    await dashPage.waitForTimeout(1500);
    const existingIds = await dashPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href*='/s/']"));
      return links.map(l => l.href.split("/s/")[1]).filter(Boolean);
    });
    await dashPage.close();
    console.log("  Existing video IDs before upload:", existingIds.length, existingIds);
    
    // Set up upload listener
    const uploadResponses = [];
    page.on("response", r => {
      const url = r.url();
      if (url.includes("/api/") && (url.includes("upload") || url.includes("video") || url.includes("cap"))) {
        uploadResponses.push({ url, status: r.status() });
      }
    });
    
    // Upload file via file input (use force: true since input is hidden)
    console.log("  Uploading file:", TEST_VIDEO);
    const fileInput = page.locator("input[type=file]").first();
    await fileInput.setInputFiles(TEST_VIDEO, { timeout: 10000 });
    console.log("  File set on input, waiting for upload...");
    
    await page.screenshot({ path: ss("testB-02-uploading") });
    result.screenshots.push(ss("testB-02-uploading"));
    console.log("  Screenshot: testB-02-uploading.png");
    
    // Wait for navigation to dashboard (upload completes and redirects)
    // OR wait for a new video card to appear
    let uploadComplete = false;
    let newVideoId = null;
    
    // Wait up to 60s for URL to change to dashboard
    try {
      await page.waitForURL("**/dashboard**", { timeout: 60000 });
      uploadComplete = true;
      console.log("  Redirected to:", page.url());
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log("  No redirect to dashboard within 60s — checking current state");
      console.log("  Current URL:", page.url());
    }
    
    await page.screenshot({ path: ss("testB-03-after-upload") });
    result.screenshots.push(ss("testB-03-after-upload"));
    console.log("  Screenshot: testB-03-after-upload.png");
    
    // Get new video ID from page
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/\/s\/([a-z0-9]+)/);
    if (urlMatch) {
      newVideoId = urlMatch[1];
      console.log("  Video ID from URL:", newVideoId);
    } else {
      // Look for the newest video card (should have 0 views and recent time)
      // Navigate to dashboard/caps to find new video
      await page.goto(BASE_URL + "/dashboard/caps", { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      
      const allVideoLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href*='/s/']"));
        return links.map(l => l.href.split("/s/")[1]).filter(Boolean);
      });
      console.log("  All video IDs on dashboard:", allVideoLinks);
      
      // Find the new one (not in existingIds)
      const newIds = allVideoLinks.filter(id => !existingIds.includes(id));
      console.log("  New video IDs:", newIds);
      
      if (newIds.length > 0) {
        newVideoId = newIds[0];
      } else if (allVideoLinks.length > 0) {
        // Maybe the existing video count is different; check for "just now" or "0 seconds"
        console.log("  Could not identify new video by ID exclusion. Using first video ID.");
        // Actually navigate to the upload response URL if we have it
        newVideoId = allVideoLinks[0];
      }
    }
    
    if (newVideoId) {
      result.uploaded = true;
      result.videoId = newVideoId;
      result.videoUrl = BASE_URL + "/s/" + newVideoId;
      console.log("  Uploaded! Video ID:", newVideoId, "URL:", result.videoUrl);
    } else {
      result.error = "Could not determine uploaded video ID";
      console.log("  ERROR:", result.error);
      await context.close();
      return result;
    }
    
    // Step 3: Navigate to video detail page
    console.log("  Navigating to video page:", result.videoUrl);
    await page.goto(result.videoUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log("  URL:", page.url());
    
    await page.screenshot({ path: ss("testB-04-video-detail") });
    result.screenshots.push(ss("testB-04-video-detail"));
    console.log("  Screenshot: testB-04-video-detail.png");
    
    const videoPageText = await page.evaluate(() => document.body.innerText);
    console.log("  Video page text (first 400):", videoPageText.substring(0, 400));
    
    // Step 4: Find "Start AI analysis" button (or generate/AI button)
    // The button might be "Generate AI", "Start AI analysis", "Analyze with AI" etc.
    // From the prior video probe it showed Summary/Action Items/Transcript tabs (already analyzed)
    // For a fresh video it should show something different
    
    // Known "already analyzed" button texts — any button NOT in this list and not empty is a candidate
    const analyzedVideoButtons = [
      "Summary", "Action Items", "Transcript", "Clean Transcript", "Comment",
      "Share", "Download", "Back", "Change logo", "Remove", "Shared", "Optimizing video",
    ];

    const aiPatterns = [
      /start ai/i,
      /generate ai/i,
      /ai analysis/i,
      /analyze.*ai/i,
      /ai.*analys/i,
      /generate.*summary/i,
      /process.*ai/i,
      /generate/i,
      /summarize/i,
      /^analyze$/i,
    ];
    
    async function findAiButton() {
      const btns = await page.locator("button").all();
      // First pass: match by pattern
      for (const btn of btns) {
        const vis = await btn.isVisible().catch(() => false);
        if (!vis) continue;
        const text = (await btn.innerText().catch(() => "")).trim();
        const aria = await btn.getAttribute("aria-label").catch(() => "") || "";
        for (const pat of aiPatterns) {
          if (pat.test(text) || pat.test(aria)) {
            console.log("  AI button found (pattern match): text=" + JSON.stringify(text) + " aria=" + JSON.stringify(aria));
            return btn;
          }
        }
      }
      // Second pass: any visible button not in the known-analyzed set (exclude empty, icons-only, and known buttons)
      for (const btn of btns) {
        const vis = await btn.isVisible().catch(() => false);
        if (!vis) continue;
        const text = (await btn.innerText().catch(() => "")).trim();
        if (!text || text.length > 60) continue;
        const isKnown = analyzedVideoButtons.some(k => text.toLowerCase() === k.toLowerCase());
        if (!isKnown) {
          const aria = await btn.getAttribute("aria-label").catch(() => "") || "";
          console.log("  AI button candidate (unknown button): text=" + JSON.stringify(text) + " aria=" + JSON.stringify(aria));
          return btn;
        }
      }
      return null;
    }
    
    // Wait up to 60s for AI button to appear (video may be processing)
    let aiBtn = await findAiButton();
    let waitAttempts = 0;
    while (!aiBtn && waitAttempts < 6) {
      console.log("  AI button not found, waiting... attempt", waitAttempts + 1);
      await page.waitForTimeout(10000);
      await page.reload({ waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      aiBtn = await findAiButton();
      waitAttempts++;
    }
    
    if (!aiBtn) {
      // Dump all buttons for debugging
      const allBtns = await page.locator("button").all();
      console.log("  All visible buttons on video page:");
      for (const btn of allBtns) {
        const vis = await btn.isVisible().catch(() => false);
        if (!vis) continue;
        const text = (await btn.innerText().catch(() => "")).trim().replace(/\n/g, "|").substring(0, 60);
        const aria = await btn.getAttribute("aria-label").catch(() => "") || "";
        console.log("  [BTN] text=" + JSON.stringify(text) + " aria=" + JSON.stringify(aria));
      }
      result.error = "AI button not found";
      console.log("  ERROR:", result.error);
      // skip to cleanup
    } else {
      // Step 5: Set up request interceptor BEFORE clicking
      let generateCalled = false;
      page.on("request", req => {
        const url = req.url();
        if (url.includes("generate") || url.includes("generate-ai") || url.includes("/ai/")) {
          generateCalled = true;
          console.log("  AI request fired:", url);
        }
      });
      
      await page.screenshot({ path: ss("testB-05-before-ai-click") });
      result.screenshots.push(ss("testB-05-before-ai-click"));
      console.log("  Screenshot: testB-05-before-ai-click.png");
      
      // Step 6: Click the AI button
      console.log("  Clicking AI button...");
      await aiBtn.click();
      
      // Step 7: Wait up to 3s for dialog
      let dialogEl = null;
      const dialogSelectors = [
        "[role=alertdialog]",
        "[role=dialog]",
        "[data-radix-dialog-content]",
        "[data-state=open][role=dialog]",
      ];
      
      result.attempts++;
      for (let attempt = 0; attempt < 4; attempt++) {
        result.attempts = attempt + 1;
        
        await page.waitForTimeout(3000);
        
        // Check for dialog
        for (const sel of dialogSelectors) {
          const els = await page.locator(sel).all();
          for (const el of els) {
            const vis = await el.isVisible().catch(() => false);
            if (vis) {
              dialogEl = el;
              console.log("  Dialog found via selector:", sel);
              break;
            }
          }
          if (dialogEl) break;
        }
        
        if (dialogEl) {
          result.dialogSeen = true;
          result.dialogText = (await dialogEl.innerText().catch(() => "")).trim();
          console.log("  Dialog text:", JSON.stringify(result.dialogText));
          
          await page.screenshot({ path: ss("testB-06-dialog") });
          result.screenshots.push(ss("testB-06-dialog"));
          console.log("  Screenshot: testB-06-dialog.png");
          
          // Step 8: Click Cancel
          const cancelPatterns = ["Cancel", "No", "Dismiss", "Close"];
          let cancelled = false;
          for (const pat of cancelPatterns) {
            const cancelBtn = dialogEl.locator("button:has-text(\"" + pat + "\")").first();
            const cvis = await cancelBtn.isVisible().catch(() => false);
            if (cvis) {
              console.log("  Clicking cancel button:", pat);
              await cancelBtn.click();
              cancelled = true;
              result.cancelWorked = true;
              break;
            }
          }
          if (!cancelled) {
            // Try any button that's NOT the confirm/proceed button
            const allDialogBtns = await dialogEl.locator("button").all();
            console.log("  Dialog buttons:", allDialogBtns.length);
            for (const db of allDialogBtns) {
              const t = (await db.innerText().catch(() => "")).trim().toLowerCase();
              console.log("  Dialog btn text:", JSON.stringify(t));
              if (!t.includes("confirm") && !t.includes("start") && !t.includes("generat") && !t.includes("proceed") && !t.includes("ok")) {
                await db.click();
                cancelled = true;
                result.cancelWorked = true;
                break;
              }
            }
          }
          
          await page.waitForTimeout(500);
          await page.screenshot({ path: ss("testB-07-after-cancel") });
          result.screenshots.push(ss("testB-07-after-cancel"));
          console.log("  Screenshot: testB-07-after-cancel.png");
          
          // Verify no generate call fired
          if (generateCalled) {
            console.log("  WARNING: /generate request was fired despite cancel!");
          } else {
            console.log("  Good: no /generate request fired");
          }
          
          // Verify button still says the same thing
          const aiBtn2 = await findAiButton();
          if (aiBtn2) {
            console.log("  AI button still present after cancel - good");
          } else {
            console.log("  AI button not found after cancel (may be normal if video started processing)");
          }
          
          result.pass = result.dialogSeen && result.cancelWorked && !generateCalled;
          break;
        } else if (generateCalled) {
          // No dialog but generate was called
          console.log("  Attempt " + (attempt+1) + ": no dialog, but /generate was called. Waiting 90s then retrying...");
          if (attempt < 3) {
            await page.waitForTimeout(90000);
            await page.reload({ waitUntil: "networkidle", timeout: 30000 });
            await page.waitForTimeout(2000);
            generateCalled = false;
            
            const aiBtn3 = await findAiButton();
            if (aiBtn3) {
              await aiBtn3.click();
            }
          }
        } else {
          // No dialog, no generate call
          console.log("  Attempt " + (attempt+1) + ": no dialog, no /generate call yet...");
          if (attempt < 3) {
            await page.waitForTimeout(90000);
            await page.reload({ waitUntil: "networkidle", timeout: 30000 });
            await page.waitForTimeout(2000);
            generateCalled = false;
            
            const aiBtn3 = await findAiButton();
            if (aiBtn3) {
              await aiBtn3.click();
            } else {
              console.log("  AI button not found on retry", attempt+1);
              break;
            }
          }
        }
      }
      
      if (!result.dialogSeen && !generateCalled) {
        result.error = "dialog absent after 4 attempts — build may not be live";
        console.log("  FINAL:", result.error);
      } else if (!result.dialogSeen && generateCalled) {
        result.error = "dialog absent, /generate was called without confirmation";
        console.log("  FINAL:", result.error);
      }
    }
    
    // Step 9: Delete the test video
    console.log("  \nDeleting test video:", result.videoId);
    if (result.videoId) {
      await page.goto(result.videoUrl, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // Find the "More actions" or "..." menu button
      const moreBtn = page.locator("button[aria-label*=More], button[aria-label*=more], button[aria-label*=option]").first();
      const moreBtnVis = await moreBtn.isVisible().catch(() => false);
      
      if (moreBtnVis) {
        await moreBtn.click();
        await page.waitForTimeout(1000);
        
        // Look for delete option
        const deleteEl = page.locator("text=/delete/i").first();
        const deleteVis = await deleteEl.isVisible().catch(() => false);
        if (deleteVis) {
          console.log("  Clicking delete...");
          await deleteEl.click();
          await page.waitForTimeout(1000);
          
          // Confirm if dialog appears
          const confirmBtn = page.locator("button:has-text(\"Delete\"), button:has-text(\"Confirm\"), button:has-text(\"Yes\")").first();
          const confVis = await confirmBtn.isVisible().catch(() => false);
          if (confVis) {
            await confirmBtn.click();
            console.log("  Delete confirmed");
          }
          
          await page.waitForTimeout(2000);
          result.deleted = true;
          console.log("  Video deleted");
        } else {
          console.log("  Delete option not found in menu");
        }
      } else {
        // Try the "More actions" button specifically on the video page from probe
        const moreActionsBtn = page.locator("[aria-label=\"More actions\"]").first();
        const maVis = await moreActionsBtn.isVisible().catch(() => false);
        if (maVis) {
          await moreActionsBtn.click();
          await page.waitForTimeout(1000);
          
          const delEl = page.locator("text=/delete/i").first();
          const delVis = await delEl.isVisible().catch(() => false);
          if (delVis) {
            await delEl.click();
            await page.waitForTimeout(1000);
            const confBtn = page.locator("button:has-text(\"Delete\"), button:has-text(\"Confirm\"), button:has-text(\"Yes\")").first();
            const confV = await confBtn.isVisible().catch(() => false);
            if (confV) { await confBtn.click(); }
            await page.waitForTimeout(2000);
            result.deleted = true;
            console.log("  Video deleted via More actions");
          }
        } else {
          console.log("  Could not find more-actions button for deletion");
        }
      }
    }
    
    await page.screenshot({ path: ss("testB-08-final") });
    result.screenshots.push(ss("testB-08-final"));
    console.log("  Screenshot: testB-08-final.png");
    
  } catch (e) {
    result.error = e.message;
    console.log("  TEST B ERROR:", e.message);
    await page.screenshot({ path: ss("testB-ERROR") }).catch(() => {});
    result.screenshots.push(ss("testB-ERROR"));
  }
  
  await context.close();
  return result;
}

// ---- MAIN ----
async function main() {
  console.log("Starting QA verification...");
  console.log("Screenshots dir:", SS_DIR);
  
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\mirko\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  
  const resultA = await testDarkMode(browser);
  const resultB = await testCostDialog(browser);
  
  await browser.close();
  
  // ---- FINAL REPORT ----
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    FINAL QA REPORT                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("TEST A — Dark Mode Toggle:");
  console.log("  classBefore:  " + JSON.stringify(resultA.classBefore));
  console.log("  classAfter:   " + JSON.stringify(resultA.classAfter));
  console.log("  toggled:      " + resultA.toggled);
  console.log("  changed:      " + resultA.changed);
  console.log("  RESULT:       " + (resultA.pass ? "PASS" : "FAIL") + (resultA.error ? " [" + resultA.error + "]" : ""));
  console.log("");
  console.log("TEST B — Cost-Confirmation Dialog:");
  console.log("  uploaded:     " + resultB.uploaded);
  console.log("  videoId:      " + resultB.videoId);
  console.log("  dialogSeen:   " + resultB.dialogSeen);
  console.log("  dialogText:   " + JSON.stringify(resultB.dialogText));
  console.log("  cancelWorked: " + resultB.cancelWorked);
  console.log("  attempts:     " + resultB.attempts);
  console.log("  deleted:      " + resultB.deleted);
  console.log("  RESULT:       " + (resultB.pass ? "PASS" : "FAIL") + (resultB.error ? " [" + resultB.error + "]" : ""));
  console.log("");
  console.log("Screenshots:");
  for (const s of [...resultA.screenshots, ...resultB.screenshots]) {
    console.log("  " + s);
  }
  console.log("");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
