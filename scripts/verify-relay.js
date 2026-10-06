import { Realtime } from "ably";
import { randomUUID } from "node:crypto";

const endpoint = process.env.TOKEN_SERVICE_URL?.replace(/\/$/, "");
if (!endpoint || !process.env.SETUP_KEY) throw new Error("Set TOKEN_SERVICE_URL and SETUP_KEY in .env first.");
const url = new URL(endpoint);
if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTPS token-service URL, or localhost for testing.");
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
function event(channel, name, id) {
  let listener;
  const pending = new Promise(resolve => {
    listener = message => { if (message.data?.id === id) resolve(message); };
    channel.subscribe(name, listener).catch(() => {});
  });
  return timeout(pending, name).finally(() => channel.unsubscribe(name, listener));
}
try {
  const health = await fetch(endpoint + "/health", { signal: AbortSignal.timeout(15000) });
  if (!health.ok) throw new Error("Token-service health check failed.");
  const host = await request("/session", { name: "Setup test A" }, process.env.SETUP_KEY);
  const guest = await request("/join", { name: "Setup test B", inviteCode: host.inviteCode });
  for (const member of [host, guest]) {
    const client = new Realtime({ clientId: member.clientId, queueMessages: false, logLevel: 0, authCallback: (_params, callback) => request("/token", {}, member.credential).then(token => callback(null, token), error => callback(error, null)) });
    clients.push(client);
    await timeout(client.channels.get(member.channel).attach(), "Ably channel attach");
    await timeout(client.channels.get(member.channel).presence.enter({ name: member.name }), "Presence enter");
  }
  const [sender, receiver] = clients.map(client => client.channels.get(host.channel));
  const members = await timeout(sender.presence.get(), "Presence lookup");
  if (!members.some(member => member.clientId === guest.clientId)) throw new Error("Partner presence was not visible.");
  const id = randomUUID();
  const received = event(receiver, "text", id);
  const began = performance.now();
  const [, message] = await Promise.all([sender.publish("text", { id, name: host.name, text: "Sales Buddy setup verification", test: true }), received]);
  if (message.clientId !== host.clientId) throw new Error("Message identity mismatch.");
  const delay = Math.round(performance.now() - began);
  const claimId = randomUUID();
  const claimed = event(sender, "claim", claimId);
  await Promise.all([receiver.publish("claim", { id: claimId, name: guest.name, test: true }), claimed]);
  let persisted = false;
  const deadline = Date.now() + 10000;
  while (!persisted && Date.now() < deadline) {
    const history = await timeout(receiver.history({ limit: 10 }), "History lookup");
    persisted = history.items.some(item => item.data?.id === id);
    if (!persisted) await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!persisted) throw new Error("The test message was not available in history. Check the sales-buddy:* persistence rule.");
  console.log(`Live Ably check passed: pairing, scoped authentication, presence, text, claim, and history. Text arrival: ${delay} ms in this one local-machine test.`);
  console.log("The test used its own temporary private channel. No real conversation was changed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { for (const client of clients) client.close(); }
