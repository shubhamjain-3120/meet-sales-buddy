import { test, expect } from "@playwright/test";
import { createService } from "../../auth/service.js";
import { createStore } from "../../auth/store.js";
import { localDatabase } from "../../auth/local-database.js";

const key = "k".repeat(32);
async function setup(page, role = "owner") {
  const db = localDatabase();
  let revocationFails = true;
  const service = createService({ apiKey: "app.key:dummy", sessionSecret: "s".repeat(32), setupKey: key, store: createStore(db), revoke: async () => { if (revocationFails) throw new Error("Unavailable"); } });
  let session = role ? await service.create("Shubham", key) : null;
  const owner = session;
  if (role === "member") { const invite = await service.invite(owner.credential); session = await service.join("Alex", invite.inviteCode); }
  await page.exposeFunction("testRPC", async message => {
    try {
      let data;
      if (message.type === "get-session") data = session;
      if (message.type === "create") { session = await service.create(message.name, message.setupKey); data = session; }
      if (message.type === "join") { session = await service.join(message.name, JSON.parse(Buffer.from(message.invite, "base64")).code); data = session; }
      if (message.type === "dashboard") data = await service.dashboard(session.credential);
      if (message.type === "invite") { const invite = await service.invite(session.credential); data = { id: invite.id, code: Buffer.from(JSON.stringify({ version: 2, endpoint: "https://example.test", code: invite.inviteCode })).toString("base64") }; }
      if (message.type === "revoke-invite") data = await service.revokeInvite(session.credential, message.id);
      if (message.type === "remove-member") data = await service.remove(session.credential, message.id);
      if (message.type === "leave") session = null;
      return { data };
    } catch (error) { return { error: error.message }; }
  });
  await page.addInitScript(() => { window.chrome = { runtime: { sendMessage: message => window.testRPC(message) }, permissions: { request: async () => true } }; });
  await page.goto("/extension/options.html");
  return { service, owner, close: () => db.close(), allowRevocation: () => { revocationFails = false; } };
}
test("owner creates and revokes invites, removes a member and retries live cutoff", async ({ page }) => {
  const fixture = await setup(page);
  try {
    await expect(page.locator("#invites")).toHaveText("No invites yet.");
    await page.locator("#new-invite").click();
    await expect(page.locator("#invite-result")).toBeVisible();
    const code = await page.locator("#invite-output").inputValue();
    expect(JSON.parse(Buffer.from(code, "base64")).version).toBe(2);
    await expect(page.locator("#invites")).toContainText("Active");
    await page.screenshot({ path: "artifacts/room-owner-preview.png", fullPage: true, mask: [page.locator("#invite-output")], maskColor: "#334155" });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.locator("#invites")).toContainText("Revoked");
    await expect(page.locator("#invite-result")).toBeHidden();
    const invite = await fixture.service.invite(fixture.owner.credential);
    await fixture.service.join("<b>Alex</b>", invite.inviteCode);
    await page.locator("#refresh").click();
    await expect(page.locator("#members")).toContainText("<b>Alex</b>");
    expect(await page.locator("#members b").count()).toBe(0);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator("#status")).toContainText("Live cutoff is pending");
    await expect(page.getByRole("button", { name: "Retry cutoff" })).toBeVisible();
    fixture.allowRevocation();
    await page.getByRole("button", { name: "Retry cutoff" }).click();
    await expect(page.locator("#status")).toHaveText("Member removed.");
    await expect(page.getByRole("button", { name: "Retry cutoff" })).toHaveCount(0);
  } finally { fixture.close(); }
});
test("guest has no owner controls and browser removal returns to setup", async ({ page }) => {
  const fixture = await setup(page, "member");
  try {
    await expect(page.locator("#active-name")).toHaveText("Alex");
    await expect(page.locator("#owner-controls")).toBeHidden();
    await expect(page.locator("#status")).toHaveText("Your membership is saved.");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#leave").click();
    await expect(page.locator("#setup")).toBeVisible();
    await expect(page.locator("#active")).toBeHidden();
  } finally { fixture.close(); }
});
test("setup errors preserve inputs, successful setup clears secrets, and joining needs only name and invite", async ({ page }) => {
  const fixture = await setup(page, null);
  try {
    await page.locator("#name").fill("Owner");
    await page.locator("#setup-key").fill("bad");
    await page.locator("#submit").click();
    await expect(page.locator("#status")).toHaveText("Incorrect setup key.");
    await expect(page.locator("#name")).toHaveValue("Owner");
    await page.locator("#setup-key").fill(` ${key} `);
    await page.locator("#submit").click();
    await expect(page.locator("#setup")).toBeHidden();
    await expect(page.locator("#setup-key")).toHaveValue("");
    const owner = await fixture.service.create("Owner", key);
    const invite = await fixture.service.invite(owner.credential);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#leave").click();
    await page.locator("#join-mode").click();
    await expect(page.locator("#create-fields")).toBeHidden();
    await page.locator("#name").fill("Partner");
    await page.locator("#invite-input").fill(Buffer.from(JSON.stringify({ version: 2, endpoint: "https://example.test", code: invite.inviteCode })).toString("base64"));
    await page.locator("#submit").click();
    await expect(page.locator("#active-name")).toHaveText("Partner");
    await expect(page.locator("#owner-controls")).toBeHidden();
    await expect(page.locator("#invite-input")).toHaveValue("");
  } finally { fixture.close(); }
});
