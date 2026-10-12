import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { createPreviewServer } from "../preview/server.js";

await import("./build.js");
const output = resolve("artifacts/chrome-store");
const packaged = resolve(output, "extension");
await mkdir(output, { recursive: true });
await rm(packaged, { recursive: true, force: true });
await mkdir(resolve(packaged, "icons"), { recursive: true });
const publisher = JSON.parse(await readFile("store/publisher.json", "utf8"));
if (!publisher.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publisher.supportEmail) || !/^\d{4}-\d{2}-\d{2}$/.test(publisher.policyUpdated)) throw new Error("Confirm the public publisher details before preparing the policy.");
const escape = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
let policy = await readFile("store/privacy.template.html", "utf8");
for (const [key, value] of Object.entries({ PUBLISHER: publisher.name, SUPPORT_EMAIL: publisher.supportEmail, UPDATED: publisher.policyUpdated, DRAFT_NOTICE: "" })) policy = policy.replaceAll(`{{${key}}}`, escape(value));
if (/\{\{[A-Z_]+\}\}/.test(policy)) throw new Error("Unresolved privacy policy placeholders.");
await writeFile("store/privacy.html", policy);
await writeFile(resolve(output, "privacy.html"), policy);
for (const file of ["listing.md", "reviewer-instructions.md", "README.md"]) await copyFile(`store/${file}`, resolve(output, file));
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
const icon = await readFile("store/icon.svg", "utf8");
manifest.icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/icon-${size}.png`]));
manifest.action.default_icon = { 16: manifest.icons[16], 32: manifest.icons[32] };
const files = new Set([...manifest.content_scripts.flatMap(script => script.js), manifest.background.service_worker, manifest.options_ui.page, "options.js", "options.css", "ABLY-LICENSE.txt", "LICENSE.txt"]);
for (const file of files) {
  if (basename(file) !== file) throw new Error("Unexpected package file path.");
  await copyFile(`extension/${file}`, resolve(packaged, file));
}
await writeFile(resolve(packaged, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const browser = await chromium.launch();
const server = createPreviewServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  let page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${icon}`);
    await page.screenshot({ path: resolve(packaged, manifest.icons[size]), omitBackground: true });
  }
  await copyFile(resolve(packaged, manifest.icons[128]), resolve(output, "icon-128.png"));
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:440px;height:280px;background:#15181e;color:#edf0f5;font-family:system-ui,sans-serif}main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}svg{width:120px;height:120px;margin-top:-12px}h1{font-size:27px;letter-spacing:-.8px;margin:6px 0 10px}.dots{display:flex;gap:7px}.dots span{width:5px;height:5px;background:#59d699;border-radius:50%}</style><main>${icon}<h1>Meet Sales Buddy</h1><div class="dots"><span></span><span></span><span></span></div></main>`);
  await page.screenshot({ path: resolve(output, "promo-440x280.png") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.install();
  await page.goto(base);
  await page.locator("#sales-buddy-strip").waitFor();
  await page.addStyleTag({ content: ".demo-controls{display:none}.meeting{height:calc(100vh - 100px)}" });
  await page.locator(".meet-footer > span").first().evaluate(node => { node.textContent = "Sales call preview · Actual extension UI"; });
  await page.getByRole("textbox", { name: "Message your partner" }).fill("I'll cover pricing next.");
  await page.screenshot({ path: resolve(output, "screenshot-01-messages.png") });
  await page.locator("#partner-claim").evaluate(button => button.click());
  await page.clock.fastForward(200);
  await page.screenshot({ path: resolve(output, "screenshot-02-claim.png") });
  await page.clock.fastForward(5001);
  const input = page.getByRole("textbox", { name: "Message your partner" });
  for (const text of ["Let's ask about rollout.", "I'll cover pricing.", "Confirm the next step before we wrap up."]) { await input.fill(text); await input.press("Enter"); }
  for (let count = 0; count < 2; count++) await page.locator("#partner-message").evaluate(button => button.click());
  await page.getByRole("button", { name: "View message history" }).click();
  await page.screenshot({ path: resolve(output, "screenshot-03-history.png") });
  await page.close();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.chrome = { runtime: { sendMessage: async message => ({ data: message.type === "get-session" ? { role: "owner", name: "Example owner" } : { invites: [{id:"example-invite",revoked_at:null,used_by:"example-member"}], members: [{id:"owner",name:"Example owner",role:"owner",revoked_at:null,removal_pending:0},{id:"member",name:"Example teammate",role:"member",revoked_at:null,removal_pending:0}] } }) } };
  });
  await page.goto(base + "/extension/options.html");
  await page.locator("#status").filter({ hasText: "Your membership is saved." }).waitFor();
  await page.locator(".intro").evaluate(node => { node.textContent += " Example data shown."; });
  await page.screenshot({ path: resolve(output, "screenshot-04-members.png") });
  await page.setContent(policy);
  await page.screenshot({ path: resolve(output, "privacy-preview.png"), fullPage: true });
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
const archive = resolve(output, `meet-sales-buddy-store-${manifest.version}.zip`);
await rm(archive, { force: true });
const zip = spawnSync("zip", ["-q", "-r", archive, "."], { cwd: packaged, encoding: "utf8" });
if (zip.status) throw new Error("ZIP packaging failed.");
const entryList = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
const entries = entryList.stdout.trim().split("\n");
if (entryList.status || !entries.includes("manifest.json") || entries.some(file => /(^|\/)(?:\.env|auth|store|node_modules|reviewer-credentials)/.test(file))) throw new Error("Invalid store ZIP contents.");
for (const [file, width, height] of [
  ...[16,32,48,128].map(size => [resolve(packaged, manifest.icons[size]), size, size]),
  [resolve(output, "promo-440x280.png"), 440, 280],
  ...["messages", "claim", "history", "members"].map((label, index) => [resolve(output, `screenshot-0${index + 1}-${label}.png`), 1280, 800])
]) {
  const png = await readFile(file);
  if (png.toString("hex", 0, 8) !== "89504e470d0a1a0a" || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error(`Invalid PNG dimensions: ${basename(file)}`);
}
await writeFile(resolve(output, "validation.json"), JSON.stringify({ version: manifest.version, manifestAtRoot: true, iconSizes: [16,32,48,128], promo: [440,280], screenshots: [1280,800], source: "Actual packaged extension UI with fictional sample data on a labelled call preview", reviewAccess: "Not provisioned — instructions only by owner request", upload: "Not uploaded or submitted" }, null, 2) + "\n");
console.log(`Store draft prepared in ${output}. Reviewer access and owner review are still required before submission.`);
