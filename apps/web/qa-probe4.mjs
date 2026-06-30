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

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  console.log("--- Login ---");
  await page.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Get the full sidebar HTML to understand the structure
  const navHtml = await page.locator("nav[aria-label=Sidebar]").innerHTML().catch(() => "");
  console.log("NAV HTML (first 3000 chars):\n" + navHtml.substring(0, 3000));

  // Find the container div with aria-haspopup=dialog  
  const container = page.locator("[aria-haspopup=dialog]").first();
  const vis = await container.isVisible().catch(() => false);
  console.log("aria-haspopup=dialog visible:", vis);
  if (vis) {
    const bb = await container.boundingBox().catch(() => null);
    const text = await container.innerText().catch(() => "");
    console.log("Container bb:", JSON.stringify(bb));
    console.log("Container text:", JSON.stringify(text));
    
    // Use force click to bypass interceptor
    await container.click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SS_DIR, "probe4-01-admin-click.png") });
    console.log("Screenshot: probe4-01-admin-click.png");
    
    const allText = await page.evaluate(() => document.body.innerText);
    const darkIdx = allText.toLowerCase().indexOf("dark");
    console.log("Dark text found:", darkIdx >= 0, darkIdx >= 0 ? allText.substring(Math.max(0, darkIdx-30), darkIdx+100) : "");
    
    const btns = await page.locator("button").all();
    console.log("Buttons after click:");
    for (const btn of btns) {
      try {
        const bvis = await btn.isVisible();
        if (!bvis) continue;
        const t = (await btn.innerText().catch(() => "")).trim().replace(/\n/g, "|").substring(0, 80);
        const aria = await btn.getAttribute("aria-label").catch(() => "") || "";
        const bbb = await btn.boundingBox().catch(() => null);
        const y = bbb ? Math.round(bbb.y) : 9999;
        if (y > 700 || t.toLowerCase().includes("dark") || t.toLowerCase().includes("theme") || t.toLowerCase().includes("sign")) {
          console.log("  [BTN y=" + y + "] text=" + JSON.stringify(t) + " aria=" + JSON.stringify(aria));
        }
      } catch(e) {}
    }
    
    // ALL visible text after click
    console.log("\nFull page text after click (first 1000):");
    console.log(allText.substring(0, 1000));
  }
  
  // Also look at the parent of aria-haspopup=dialog
  const parentHtml = await page.evaluate(() => {
    const el = document.querySelector("[aria-haspopup=dialog]");
    return el ? el.parentElement ? el.parentElement.outerHTML.substring(0, 500) : "no parent" : "not found";
  });
  console.log("\nParent of aria-haspopup element:", parentHtml);

  // Import page - check for file input BEFORE any click
  console.log("\n=== IMPORT PAGE ===");
  await page.goto(BASE_URL + "/dashboard/import", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const allFi = await page.locator("input[type=file]").all();
  console.log("File inputs (before any click):", allFi.length);
  for (const f of allFi) {
    const fvis = await f.isVisible().catch(() => false);
    const fid = await f.getAttribute("id").catch(() => "") || "";
    const facc = await f.getAttribute("accept").catch(() => "") || "";
    const fcls = (await f.getAttribute("class").catch(() => "") || "").substring(0, 60);
    const fbb = await f.boundingBox().catch(() => null);
    console.log("  FI id=" + fid + " vis=" + fvis + " accept=" + facc + " bb=" + JSON.stringify(fbb));
  }
  
  const importHTML = await page.evaluate(() => document.body.innerHTML);
  // Find file input in HTML
  const fiIdx = importHTML.indexOf("type=\"file\"");
  const fiIdx2 = importHTML.indexOf("type='file'");
  console.log("file input in HTML at:", fiIdx, fiIdx2);
  if (fiIdx >= 0) {
    console.log("HTML around file input:", importHTML.substring(Math.max(0, fiIdx-300), fiIdx+400));
  }
  
  console.log("\nImport page buttons:");
  const impBtns = await page.locator("button").all();
  for (const btn of impBtns) {
    try {
      const bvis = await btn.isVisible();
      if (!bvis) continue;
      const t = (await btn.innerText().catch(() => "")).trim().replace(/\n/g, "|").substring(0, 80);
      const aria = await btn.getAttribute("aria-label").catch(() => "") || "";
      const bbb = await btn.boundingBox().catch(() => null);
      const y = bbb ? Math.round(bbb.y) : 9999;
      console.log("  [BTN y=" + y + "] text=" + JSON.stringify(t) + " aria=" + JSON.stringify(aria));
    } catch(e) {}
  }
  
  await page.screenshot({ path: path.join(SS_DIR, "probe4-02-import.png") });
  console.log("Screenshot: probe4-02-import.png");
  console.log("Import page text:", (await page.evaluate(() => document.body.innerText)).substring(0, 600));

  await browser.close();
  console.log("\n--- PROBE4 DONE ---");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
