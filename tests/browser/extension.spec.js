import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createStore } from "../../auth/store.js";
import { localDatabase } from "../../auth/local-database.js";
import { createService } from "../../auth/service.js";

test("loaded extension stays on Meet calls, remembers pairing, and reacts to removal", async () => {
  const profile = await mkdtemp(join(tmpdir(), "sales-buddy-browser-"));
  const folder = resolve(process.env.EXTENSION_TEST_PATH || "extension");
  const launch = () => chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, args: [`--disable-extensions-except=${folder}`, `--load-extension=${folder}`] });
  let context = await launch();
  try {
    let worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await context.route("https://meet.google.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Meet test fixture</body></html>" }));
    await page.goto("https://meet.google.com/");
    await expect(page.locator("#sales-buddy-strip")).toHaveCount(0);
    await page.goto("https://meet.google.com/abc-defg-hij");
    await expect(page.locator(".latest")).toHaveText("Click the red dot to set up your room");
    await expect(page.locator(".claim")).toBeDisabled();
    await page.locator(".status").click();
    await expect.poll(() => context.pages().some(tab => tab.url() === `chrome-extension://${id}/options.html`)).toBe(true);

    // Setup API is separately exercised over real HTTP. Seed its response here:
    // a native optional-host permission prompt cannot be accepted in headless CI.
    const db = localDatabase();
    const service = createService({ store: createStore(db), apiKey: "app.key:dummy", sessionSecret: "s".repeat(32), setupKey: "k".repeat(32) });
    const member = await service.create("Alex", "k".repeat(32));
    db.close();
    await worker.evaluate(session => chrome.storage.local.set({ buddySession: session }), { ...member, endpoint: "http://127.0.0.1:8787" });
    await context.close();
    context = await launch();
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await expect(options.locator("#active-name")).toHaveText("Alex");
    await expect(options.locator("#setup")).toBeHidden();
    await expect(options.locator("#setup-key")).toHaveValue("");
    await context.route("https://meet.google.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Meet test fixture</body></html>" }));
    const meet = await context.newPage();
    await meet.goto("https://meet.google.com/abc-defg-hij");
    await expect(meet.locator("#sales-buddy-strip")).toHaveCount(1);
    options.once("dialog", dialog => dialog.accept());
    await options.locator("#leave").click();
    await expect(options.locator("#setup")).toBeVisible();
    await expect(meet.locator(".latest")).toHaveText("Click the red dot to set up your room");
    expect(await worker.evaluate(async () => (await chrome.storage.local.get("buddySession")).buddySession)).toBeUndefined();
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
