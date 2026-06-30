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

  await page.goto(BASE_URL + "/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Get full sidebar nav HTML
  const navEl = page.locator("nav[aria-label=Sidebar]");
  const navExists = await navEl.isVisible().catch(() => false);
  console.log("Nav exists:", navExists);
  
  if (navExists) {
    const navHtml = await navEl.innerHTML().catch(() => "");
    console.log("\nFULL NAV HTML (" + navHtml.length + " chars):");
    console.log(navHtml);
  }
  
  // Also get ALL elements with role=button or tabindex=0 anywhere
  const allInteractive = await page.evaluate(() => {
    const els = document.querySelectorAll("[tabindex], button, a, [role=button]");
    const result = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      result.push({
        tag: el.tagName,
        role: el.getAttribute("role") || "",
        tabindex: el.getAttribute("tabindex") || "",
        text: (el.innerText || "").trim().substring(0, 80).replace(/\n/g, "|"),
        ariaLabel: el.getAttribute("aria-label") || "",
        ariaHaspopup: el.getAttribute("aria-haspopup") || "",
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
    return result.sort((a, b) => a.y - b.y);
  });
  
  console.log("\nALL INTERACTIVE ELEMENTS (sorted by y):");
  for (const el of allInteractive) {
    if (el.x < 300) { // left sidebar
      console.log("  [x=" + el.x + " y=" + el.y + " tag=" + el.tag + " role=" + el.role + "] text=" + JSON.stringify(el.text) + " aria=" + JSON.stringify(el.ariaLabel) + " haspopup=" + el.ariaHaspopup);
    }
  }

  // Screenshot to see current state
  await page.screenshot({ path: path.join(SS_DIR, "probe5-01-dashboard.png"), fullPage: false });
  console.log("Screenshot: probe5-01-dashboard.png");
  
  // Try clicking the "A Admin" section - it's at the bottom of the sidebar
  // It shows as "A\nAdmin" in page text but where is it in the DOM?
  const adminText = await page.evaluate(() => {
    // Search for element containing both "A" and "Admin" text
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found = [];
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text === "Admin") {
        found.push({
          text: text,
          parentTag: node.parentElement.tagName,
          parentRole: node.parentElement.getAttribute("role") || "",
          parentClass: (node.parentElement.className || "").substring(0, 100),
          grandParentTag: node.parentElement.parentElement ? node.parentElement.parentElement.tagName : "",
          grandParentRole: node.parentElement.parentElement ? node.parentElement.parentElement.getAttribute("role") || "" : "",
          grandParentClass: node.parentElement.parentElement ? (node.parentElement.parentElement.className || "").substring(0, 100) : "",
          rect: (() => {
            const r = node.parentElement.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          })(),
        });
      }
    }
    return found;
  });
  console.log("\nElements containing 'Admin' text:");
  for (const a of adminText) {
    console.log("  ", JSON.stringify(a));
  }
  
  // Find the outer clickable container for Admin
  const adminOuterInfo = await page.evaluate(() => {
    // Find the span containing "Admin"
    const spans = Array.from(document.querySelectorAll("span, p, div"));
    for (const el of spans) {
      if (el.textContent.trim() === "Admin") {
        // Walk up to find the clickable ancestor
        let ancestor = el.parentElement;
        while (ancestor && ancestor !== document.body) {
          if (ancestor.onclick || ancestor.getAttribute("tabindex") !== null || 
              ancestor.tagName === "BUTTON" || ancestor.getAttribute("role") === "button" ||
              ancestor.getAttribute("data-state") !== null) {
            const rect = ancestor.getBoundingClientRect();
            return {
              tag: ancestor.tagName,
              role: ancestor.getAttribute("role") || "",
              tabindex: ancestor.getAttribute("tabindex") || "",
              dataState: ancestor.getAttribute("data-state") || "",
              ariaHaspopup: ancestor.getAttribute("aria-haspopup") || "",
              cls: (ancestor.className || "").substring(0, 100),
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              outerHTML: ancestor.outerHTML.substring(0, 500),
            };
          }
          ancestor = ancestor.parentElement;
        }
      }
    }
    return null;
  });
  console.log("\nAdmin outer clickable container:", JSON.stringify(adminOuterInfo, null, 2));
  
  if (adminOuterInfo) {
    // Click it using mouse coordinates
    const cx = adminOuterInfo.x + adminOuterInfo.w / 2;
    const cy = adminOuterInfo.y + adminOuterInfo.h / 2;
    console.log("Clicking at coords:", cx, cy);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SS_DIR, "probe5-02-admin-click.png"), fullPage: false });
    console.log("Screenshot: probe5-02-admin-click.png");
    
    const bodyText = await page.evaluate(() => document.body.innerText);
    const darkIdx = bodyText.toLowerCase().indexOf("dark");
    console.log("Dark mode in page text:", darkIdx >= 0, darkIdx >= 0 ? bodyText.substring(Math.max(0, darkIdx-20), darkIdx+100) : "");
    
    // Get all visible text 
    console.log("Page text after admin click (first 800):", bodyText.substring(0, 800));
    
    // Look for all interactive elements that appeared
    const newBtns = await page.locator("button").all();
    console.log("\nButtons after admin click:");
    for (const btn of newBtns) {
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
    
    const menuitems = await page.locator("[role=menuitem]").all();
    console.log("Menuitems:", menuitems.length);
    for (const mi of menuitems) {
      try {
        const bvis = await mi.isVisible();
        const t = (await mi.innerText().catch(() => "")).trim();
        const bbb = await mi.boundingBox().catch(() => null);
        console.log("  MENUITEM visible=" + bvis + " text=" + JSON.stringify(t) + " bb=" + JSON.stringify(bbb));
      } catch(e) {}
    }
  }

  // IMPORT PAGE: look for dropzone / droppable area
  console.log("\n=== IMPORT PAGE DEEP DIVE ===");
  await page.goto(BASE_URL + "/dashboard/import", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Check ALL inputs (not just file)
  const allInputs = await page.locator("input").all();
  console.log("All inputs on import page:", allInputs.length);
  for (const inp of allInputs) {
    const itype = await inp.getAttribute("type").catch(() => "") || "";
    const iid = await inp.getAttribute("id").catch(() => "") || "";
    const ivis = await inp.isVisible().catch(() => false);
    const ibb = await inp.boundingBox().catch(() => null);
    console.log("  INPUT type=" + itype + " id=" + iid + " vis=" + ivis + " bb=" + JSON.stringify(ibb));
  }
  
  // Click the "Upload File" section to reveal file input
  const uploadSection = page.locator("text=Upload File").first();
  const uvis = await uploadSection.isVisible().catch(() => false);
  console.log("Upload File section visible:", uvis);
  if (uvis) {
    const ubb = await uploadSection.boundingBox().catch(() => null);
    const utag = await uploadSection.evaluate(e => e.tagName).catch(() => "");
    console.log("Upload section tag:", utag, "bb:", JSON.stringify(ubb));
    
    // Navigate up to find the container
    const uploadContainerInfo = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.trim() === "Upload File") {
          let ancestor = node.parentElement;
          for (let i = 0; i < 5; i++) {
            if (!ancestor) break;
            const rect = ancestor.getBoundingClientRect();
            const html = ancestor.outerHTML.substring(0, 500);
            // Check if it has onclick or is a link
            if (html.includes("dropzone") || html.includes("upload") || ancestor.tagName === "A" || ancestor.tagName === "BUTTON") {
              return { tag: ancestor.tagName, cls: (ancestor.className||"").substring(0,100), rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }, html: html };
            }
            ancestor = ancestor.parentElement;
          }
          // Just return the parent info
          const p = node.parentElement.parentElement;
          const r = p.getBoundingClientRect();
          return { tag: p.tagName, cls: (p.className||"").substring(0,100), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, html: p.outerHTML.substring(0, 600) };
        }
      }
      return null;
    });
    console.log("Upload File container:", JSON.stringify(uploadContainerInfo, null, 2));
    
    // Click it
    if (uploadContainerInfo) {
      const cx = uploadContainerInfo.rect.x + uploadContainerInfo.rect.w / 2;
      const cy = uploadContainerInfo.rect.y + uploadContainerInfo.rect.h / 2;
      console.log("Clicking upload area at:", cx, cy);
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(1000);
      
      const fiAfterClick = await page.locator("input[type=file]").all();
      console.log("File inputs after clicking upload area:", fiAfterClick.length);
      for (const f of fiAfterClick) {
        const fvis = await f.isVisible().catch(() => false);
        const fid = await f.getAttribute("id").catch(() => "") || "";
        const facc = await f.getAttribute("accept").catch(() => "") || "";
        const fcls = (await f.getAttribute("class").catch(() => "") || "").substring(0, 80);
        const fbb = await f.boundingBox().catch(() => null);
        console.log("  FI id=" + fid + " vis=" + fvis + " accept=" + facc + " cls=" + fcls + " bb=" + JSON.stringify(fbb));
      }
    }
  }
  
  // Get full import page HTML 
  const importHTML = await page.evaluate(() => document.body.innerHTML);
  console.log("\nFull import HTML (" + importHTML.length + " chars), showing first 8000:");
  console.log(importHTML.substring(0, 8000));

  await browser.close();
  console.log("\n--- PROBE5 DONE ---");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
