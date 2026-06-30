// Probe script v3: focused on combobox click and import page
import { chromium } from "@playwright/test";
import path from "path";

const BASE_URL = "https://capweb-production-dd85.up.railway.app";
const EMAIL = "admin@ustoz.uz";
const PASSWORD = "UstozAdmin2026!";
const SS_DIR = "C:\\Users\\mirko\\AppData\\Local\\Temp\\claude\\D--vibecoding\\62d789e6-45c0-4346-bba0-8943842ba186\\scratchpad\\qa-verify";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Users\\mirko\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1228\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log("--- Login ---");
  await page.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  console.log("URL:", page.url());

  // Find combobox / aria-haspopup=dialog
  const combobox = page.locator("[role=combobox]").first();
  const cbVis = await combobox.isVisible().catch(() => false);
  console.log("combobox visible:", cbVis);

  const dialogTrigger = page.locator("[aria-haspopup=dialog]").first();
  const dtVis = await dialogTrigger.isVisible().catch(() => false);
  console.log("aria-haspopup=dialog visible:", dtVis);

  const toClick = cbVis ? combobox : (dtVis ? dialogTrigger : null);
  if (toClick) {
    const text = await toClick.innerText().catch(() => "");
    const bb = await toClick.boundingBox().catch(() => null);
    console.log("Clicking element text:", JSON.stringify(text), "bb:", JSON.stringify(bb));
    await toClick.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SS_DIR, "probe3-01-combobox-click.png") });
    console.log("Screenshot: probe3-01-combobox-click.png");

    const allText = await page.evaluate(() => document.body.innerText);
    const darkIdx = allText.toLowerCase().indexOf("dark");
    if (darkIdx >= 0) {
      console.log("Dark mode text found:", allText.substring(Math.max(0, darkIdx-50), darkIdx+150));
    } else {
      console.log("No dark mode text visible.");
    }

    const btns = await page.locator("button").all();
    console.log("Buttons after click:");
    for (const btn of btns) {
      try {
        const vis = await btn.isVisible();
        if (!vis) continue;
        const t = (await btn.innerText().catch(() => "")).trim().replace(/\n/g, "|").substring(0, 80);
        const aria = await btn.getAttribute("aria-label").catch(() => "") || "";
        const bb2 = await btn.boundingBox().catch(() => null);
        const y = bb2 ? Math.round(bb2.y) : 9999;
        console.log("  [BTN y=" + y + "] text=" + JSON.stringify(t) + " aria=" + JSON.stringify(aria));
      } catch(e) {}
    }
    
    const dialogs = await page.locator("[role=dialog],[data-state=open]").all();
    for (const d of dialogs) {
      try {
        const vis = await d.isVisible();
        if (!vis) continue;
        const t = (await d.innerText().catch(() => "")).trim().substring(0, 300);
        const role = await d.getAttribute("role").catch(() => "") || "";
        console.log("DIALOG role=" + role + " text=" + JSON.stringify(t));
      } catch(e) {}
    }
  } else {
    console.log("No clickable admin element found!");
    // Dump ALL elements with text Admin
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    const idx = bodyHtml.indexOf("Admin");
    if (idx >= 0) {
      console.log("Admin in HTML:", bodyHtml.substring(Math.max(0, idx-300), idx+300));
    }
  }

  // Import page probe
  console.log("\n=== IMPORT PAGE ===");
  await page.goto(BASE_URL + "/dashboard/import", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const importHTML = await page.evaluate(() => document.body.innerHTML);
  const uIdx = importHTML.toLowerCase().indexOf("upload");
  if (uIdx >= 0) {
    console.log("HTML around upload:", importHTML.substring(Math.max(0, uIdx-100), uIdx+500));
  }

  // Try clicking "Upload File" area
  const uploadArea = page.locator("text=/Upload File/i").first();
  const uaVis = await uploadArea.isVisible().catch(() => false);
  console.log("Upload File text visible:", uaVis);
  if (uaVis) {
    const uaTag = await uploadArea.evaluate(e => e.tagName).catch(() => "");
    const uaText = await uploadArea.innerText().catch(() => "");
    console.log("Upload area tag:", uaTag, "text:", JSON.stringify(uaText));
    await uploadArea.click();
    await page.waitForTimeout(1000);
    
    const fi = await page.locator("input[type=file]").all();
    console.log("File inputs after click:", fi.length);
    for (const f of fi) {
      const vis = await f.isVisible().catch(() => false);
      const accept = await f.getAttribute("accept").catch(() => "") || "";
      const cls = (await f.getAttribute("class").catch(() => "") || "").substring(0, 80);
      const bb = await f.boundingBox().catch(() => null);
      console.log("  FILE-INPUT visible=" + vis + " accept=" + accept + " cls=" + cls + " bb=" + JSON.stringify(bb));
    }
  }

  // Check all file inputs on import page regardless
  const allFi = await page.locator("input[type=file]").all();
  console.log("ALL file inputs on import page:", allFi.length);
  for (const f of allFi) {
    const vis = await f.isVisible().catch(() => false);
    const id = await f.getAttribute("id").catch(() => "") || "";
    const accept = await f.getAttribute("accept").catch(() => "") || "";
    const cls = (await f.getAttribute("class").catch(() => "") || "").substring(0, 80);
    const bb = await f.boundingBox().catch(() => null);
    console.log("  FILE-INPUT id=" + id + " visible=" + vis + " accept=" + accept + " cls=" + cls + " bb=" + JSON.stringify(bb));
  }
  
  console.log("\nImport page HTML (first 5000 chars):");
  console.log(importHTML.substring(0, 5000));

  await browser.close();
  console.log("\n--- PROBE3 DONE ---");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
