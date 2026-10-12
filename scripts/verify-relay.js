import assert from "node:assert/strict";
import { Realtime, Rest } from "ably";
import { randomUUID } from "node:crypto";
import { createTokenServer } from "../auth/server.js";
import { localDatabase } from "../auth/local-database.js";
import { createStore } from "../auth/store.js";
import { channelFor } from "../auth/service.js";

// Always isolated: never creates a test owner or memberships in the hosted room.
const db = localDatabase();
const server = createTokenServer({ apiKey: process.env.ABLY_API_KEY, sessionSecret: process.env.SESSION_SECRET, setupKey: process.env.SETUP_KEY, store: createStore(db) });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const clients = [];
async function request(route, body = {}, credential) {
  const response = await fetch(endpoint + route, { method: "POST", signal: AbortSignal.timeout(15000), redirect: "error", headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${route} failed with HTTP ${response.status}.`);
  return route === "/token" ? response.text() : response.json();
}
function timeout(promise, label, milliseconds = 20000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds); })]).finally(() => clearTimeout(timer));
}
async function watch(channel, name, id) {
  let listener, resolve;
  const pending = new Promise(yes => { resolve = yes; });
  listener = message => { if (message.data?.id === id) resolve(message); };
  await channel.subscribe(name, listener);
  return { pending: timeout(pending, name).finally(() => channel.unsubscribe(name, listener)) };
}
async function eventually(check, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not become available.`);
}
try {
  const owner = await request("/session", { name: "Local test owner" }, process.env.SETUP_KEY);
  const members = [owner];
  for (const name of ["Local test A", "Local test B"]) {
    const invite = await request("/invite", {}, owner.credential);
    members.push(await request("/join", { name, inviteCode: invite.inviteCode }));
  }
  const meeting = `lookup/test-${randomUUID()}`;
  const channelName = channelFor(owner.room, meeting);
  for (const member of members) {
    const client = new Realtime({ clientId: member.clientId, queueMessages: false, logLevel: 0, authCallback: (_params, callback) => request("/token", { meeting }, member.credential).then(token => callback(null, token), error => callback(error, null)) });
    clients.push(client);
    const channel = client.channels.get(channelName);
    await timeout(channel.attach(), "Ably channel attach");
    await timeout(channel.presence.enter({ name: member.name }), "Presence enter");
  }
  const channels = clients.map(client => client.channels.get(channelName));
  await eventually(async () => new Set((await channels[0].presence.get()).map(member => member.clientId)).size === 3, "Three-member presence");
  const messageId = randomUUID();
  const received = await Promise.all(channels.slice(1).map(channel => watch(channel, "text", messageId)));
  const began = performance.now();
  await channels[0].publish("text", { id: messageId, name: owner.name, text: "Isolated group relay test" });
  const messages = await Promise.all(received.map(watcher => watcher.pending));
  assert.ok(messages.every(message => message.clientId === owner.clientId));
  const delay = Math.round(performance.now() - began);
  const claimId = randomUUID();
  const claimed = await watch(channels[0], "claim", claimId);
  await channels[1].publish("claim", { id: claimId, name: members[1].name });
  await claimed.pending;
  await eventually(async () => (await channels[2].history({ limit: 10 })).items.some(item => item.data?.id === messageId), "Persisted text history");
  const foreign = channelFor(owner.room, "xyz-abcd-efg");
  await assert.rejects(clients[1].channels.get(foreign).attach());
  const savedToken = await request("/token", { meeting }, members[1].credential);
  const stopped = timeout(new Promise(resolve => clients[1].connection.once("disconnected", resolve)), "Live member cutoff");
  stopped.catch(() => {});
  const removed = await request("/remove-member", { id: members[1].clientId.split(":")[1] }, owner.credential);
  assert.equal(removed.pending, false, "Enable revocable tokens on the dedicated Ably key.");
  await stopped;
  await assert.rejects(request("/token", { meeting }, members[1].credential));
  await assert.rejects(new Rest({ token: savedToken, logLevel: 0 }).channels.get(channelName).history());
  console.log(`Live Ably check passed: three-member presence, group text, claim, retained history, call isolation, and member revocation. Text fan-out: ${delay} ms in this single-machine sample.`);
  console.log("Used an isolated in-memory access database and private test channel. The hosted room was untouched.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const client of clients) client.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}
