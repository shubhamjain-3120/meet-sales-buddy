import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createTokenServer } from "../auth/server.js";
import { localDatabase } from "../auth/local-database.js";
import { createStore } from "../auth/store.js";
import { sign } from "../auth/service.js";

const setupKey = "k".repeat(32), sessionSecret = "s".repeat(32);
const trusted = { url: "chrome-extension://fixture/options.html" };
const meet = path => ({ url: `https://meet.google.com/${path}`, tab: { url: `https://meet.google.com/${path}` } });
async function fixture(context) {
  const db = localDatabase();
  const server = createTokenServer({ apiKey: "app.key:dummy", sessionSecret, setupKey, store: createStore(db), revoke: async () => {} });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  let listener, session;
  const chrome = {
    runtime: { getURL: () => "chrome-extension://fixture/", openOptionsPage: async () => {}, onMessage: { addListener: value => { listener = value; } } },
    action: { onClicked: { addListener() {} } }, permissions: { contains: async () => true },
    storage: { local: { setAccessLevel() {}, get: async () => ({ buddySession: session }), set: async value => { session = value.buddySession; }, remove: async () => { session = undefined; } }, onChanged: { addListener() {} } },
    tabs: { query: async () => [], sendMessage: async () => {} }
  };
  runInNewContext(await readFile(new URL("../extension/background.js", import.meta.url), "utf8"), { chrome, URL, fetch, AbortSignal, atob, btoa });
  const rpc = (message, sender = trusted) => new Promise((resolve, reject) => { listener(message, sender, result => result.error ? reject(new Error(result.error)) : resolve(result.data)); });
  return { endpoint, rpc, get session() { return session; }, seed: value => { session = value; } };
}
test("background stores credentials privately and scopes tokens using the actual Meet tab", async context => {
  const f = await fixture(context);
  const owner = await f.rpc({ type: "create", name: "Owner", endpoint: f.endpoint, setupKey });
  assert.equal(owner.role, "owner");
  assert.equal(owner.credential, undefined);
  assert.ok(f.session.credential);
  const profile = await f.rpc({ type: "get-session" }, meet("abc-defg-hij"));
  assert.equal(profile.channel, `sales-buddy:${profile.room}:abc-defg-hij`);
  assert.equal(profile.credential, undefined);
  const token = await f.rpc({ type: "token", meeting: "xyz-abcd-efg" }, meet("abc-defg-hij"));
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  assert.deepEqual(Object.keys(JSON.parse(payload["x-ably-capability"])), [profile.channel]);
  await assert.rejects(f.rpc({ type: "invite" }, meet("abc-defg-hij")), /Open extension settings/);
  await assert.rejects(f.rpc({ type: "get-session" }, { url: "https://other.test" }), /Unsupported page/);
  const invite = await f.rpc({ type: "invite" });
  assert.equal(JSON.parse(atob(invite.code)).version, 2);
  await f.rpc({ type: "leave" });
  assert.equal(f.session, undefined);
  const guest = await f.rpc({ type: "join", name: "Guest", invite: invite.code });
  assert.equal(guest.role, "member");
  assert.notEqual(guest.clientId, owner.clientId);
  await assert.rejects(f.rpc({ type: "invite" }), /Only the owner/);
});
test("background upgrades an existing saved pairing without repeating setup", async context => {
  const f = await fixture(context);
  const room = "a".repeat(32);
  f.seed({ endpoint: f.endpoint, name: "Original", channel: `sales-buddy:${room}`, clientId: room + ":host", credential: sign({ type: "member", room, role: "host", name: "Original" }, sessionSecret) });
  const profile = await f.rpc({ type: "get-session" }, meet("abc-defg-hij"));
  assert.equal(profile.room, room);
  assert.equal(profile.name, "Original");
  assert.equal(profile.role, "owner");
  assert.equal(f.session.role, "owner");
  assert.ok(f.session.credential);
});
