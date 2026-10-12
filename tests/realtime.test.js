import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../extension/realtime.js";

const room = "a".repeat(32);
const channelName = `sales-buddy:${room}:abc-defg-hij`;
const session = { name: "Alex", room, clientId: room + ":" + "1".repeat(32), channel: channelName };
const peerId = room + ":" + "2".repeat(32);
const thirdId = room + ":" + "3".repeat(32);
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  let receiver;
  let presenceListener;
  let channelListener;
  let connectionListener;
  const outputs = { connections: [], messages: [], claims: [], errors: [], publishes: [], historyCalls: [] };
  let members = overrides.members ?? [{ clientId: peerId, data: { name: "Alex" } }];
  const page = items => ({ items, hasNext: () => false, next: async () => null });
  const channel = {
    state: "attached",
    on(listener) { channelListener = listener; },
    async subscribe(listener) { receiver = listener; }, unsubscribe() {},
    history: async params => { outputs.historyCalls.push(params); return overrides.pages?.[0] ?? page(overrides.history ?? []); },
    publish: async (name, data) => {
      outputs.publishes.push({ name, data });
      if (overrides.publish) return overrides.publish(name, data, receiver);
      if (name === "claim") receiver({ name: "receipt", clientId: peerId, data: { id: data.id } });
    },
    presence: { async subscribe(listener) { presenceListener = listener; }, async get() { return members; }, async enter() {}, unsubscribe() {} }
  };
  const client = { connection: { state: "connected", on(listener) { connectionListener = listener; } }, channels: { get: requested => { assert.equal(requested, channelName); return channel; } }, connect() {}, close() {} };
  let clientOptions;
  let counter = 0;
  const transport = connect({
    session, getToken: async () => "jwt", createClient: options => { clientOptions = options; return client; }, uuid: () => `id-${++counter}`, now: () => 10000,
    onConnection: (connected, peer) => outputs.connections.push({ connected, peer }),
    onMessage: message => outputs.messages.push(message), onClaim: (...args) => outputs.claims.push(args), onError: error => outputs.errors.push(error)
  });
  return { transport, outputs, client, channel, get options() { return clientOptions; }, receive: message => receiver(message), async setMembers(value) { members = value; await presenceListener(); }, async losePeer() { members = []; await presenceListener(); }, async reattach() { channelListener({ current: "attached", resumed: false }); await flush(); }, async disconnect() { client.connection.state = "disconnected"; connectionListener(); await flush(); } };
}
test("the adapter renews tokens via auth callback, enters presence, and disables offline queues", async context => {
  const f = fixture(); context.after(() => f.transport.close());
  await f.transport.start();
  assert.equal(f.options.queueMessages, false);
  assert.equal(await new Promise((resolve, reject) => f.options.authCallback({}, (error, token) => error ? reject(error) : resolve(token))), "jwt");
  assert.deepEqual(f.outputs.connections.at(-1), { connected: true, peer: "Alex" });
  await f.losePeer();
  assert.deepEqual(f.outputs.connections.at(-1), { connected: true, peer: null });
  await assert.rejects(f.transport.claim(), /No other member/);
});
test("sending displays pending and Sent only, ignoring text receipts", async context => {
  const f = fixture(); context.after(() => f.transport.close()); await f.transport.start();
  await f.transport.send(" Hello ");
  assert.equal(f.outputs.messages[0].pending, true);
  assert.equal(f.outputs.messages.at(-1).pending, false);
  assert.equal(f.outputs.messages.at(-1).delivered, undefined);
  f.receive({ name: "receipt", clientId: "outsider", data: { id: "id-1" } });
  assert.equal(f.outputs.messages.at(-1).delivered, undefined);
  f.receive({ name: "receipt", clientId: peerId, data: { id: "id-1" } });
  assert.equal(f.outputs.messages.at(-1).delivered, undefined);
  f.receive({ name: "text", clientId: peerId, data: { id: "same-name", name: "Alex", text: "Partner message" }, timestamp: 10000 });
  assert.equal(f.outputs.messages.at(-1).own, false);
});
test("failed publishes mark a message failed, and disconnected sends are rejected", async context => {
  const f = fixture({ publish: async () => { throw new Error("Connection lost"); } }); context.after(() => f.transport.close()); await f.transport.start();
  await assert.rejects(f.transport.send("Draft"), /Connection lost/);
  assert.equal(f.outputs.messages.at(-1).failed, true);
  await f.disconnect();
  assert.deepEqual(f.outputs.connections.at(-1), { connected: false, peer: null });
  await assert.rejects(f.transport.send("Another draft"), /right now/);
});
test("claims publish immediately and require a partner acknowledgement", async context => {
  const f = fixture(); context.after(() => f.transport.close()); await f.transport.start();
  await f.transport.claim();
  assert.equal(f.outputs.publishes.at(-1).name, "claim");
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const silent = fixture({ publish: async () => {} }); context.after(() => silent.transport.close()); await silent.transport.start();
  const result = assert.rejects(silent.transport.claim(), /acknowledge/);
  context.mock.timers.tick(4000);
  await result;
});
test("late, duplicate, historical, and foreign claims never flash again", async context => {
  const old = { name: "claim", clientId: peerId, data: { id: "history", name: "Alex" }, timestamp: 9000 };
  const f = fixture({ history: [old, { name: "text", clientId: peerId, data: { id: "old-text", name: "Alex", text: "Previous" }, timestamp: 1000 }] }); context.after(() => f.transport.close()); await f.transport.start();
  assert.equal(f.outputs.claims.length, 0);
  assert.equal(f.outputs.messages.length, 1);
  f.receive({ ...old, data: { ...old.data, id: "fresh" } });
  f.receive({ ...old, data: { ...old.data, id: "fresh" } });
  f.receive({ ...old, timestamp: 4999, data: { ...old.data, id: "stale" } });
  f.receive({ ...old, clientId: "foreign", data: { ...old.data, id: "foreign" } });
  assert.deepEqual(f.outputs.claims, [["Alex", 4000, false]]);
  await f.reattach();
  assert.equal(f.outputs.historyCalls.length, 2);
  assert.equal(f.outputs.claims.length, 1);
  assert.equal(f.outputs.historyCalls[0].untilAttach, true);
});

test("own claim echoes preserve the same event order on both partners' strips", async context => {
  const f = fixture(); context.after(() => f.transport.close()); await f.transport.start();
  const claim = (id, clientId) => ({ name: "claim", clientId, data: { id, name: "Alex" }, timestamp: 10000 });
  f.receive(claim("first", peerId));
  f.receive({ ...claim("second", session.clientId), timestamp: 10001 });
  assert.deepEqual(f.outputs.claims, [["Alex", 5000, false], ["Alex", 5000, true]]);
});

test("presence counts distinct other members, excluding our other tabs and foreign identities", async context => {
  const person = (clientId, name) => ({ clientId, data: { name } });
  const f = fixture({ members: [person(session.clientId, "Me"), person(session.clientId, "Me"), person(peerId, "Alex"), person(peerId, "Alex"), person(thirdId, "Sam"), person("foreign", "Bad")] });
  context.after(() => f.transport.close()); await f.transport.start();
  assert.deepEqual(f.outputs.connections.at(-1), { connected: true, peer: "Alex, Sam" });
  await f.setMembers([person(session.clientId, "Me"), person(thirdId, "Sam")]);
  assert.deepEqual(f.outputs.connections.at(-1), { connected: true, peer: "Sam" });
  await f.setMembers([person(session.clientId, "Me")]);
  assert.equal(f.outputs.connections.at(-1).peer, null);
  await assert.rejects(f.transport.claim(), /No other member/);
});
test("one group member acknowledges a claim without waiting for everyone", async context => {
  const f = fixture({ members: [{ clientId: peerId }, { clientId: thirdId }], publish: async (name, data, receive) => { if (name === "claim") receive({ name: "receipt", clientId: thirdId, data: { id: data.id } }); } });
  context.after(() => f.transport.close()); await f.transport.start();
  await f.transport.claim();
  assert.equal(f.outputs.publishes.length, 1);
});
test("claims converge by server timestamp and identity when deliveries arrive out of order", async context => {
  const f = fixture(); context.after(() => f.transport.close()); await f.transport.start();
  const claim = (id, clientId, timestamp) => ({ name: "claim", clientId, timestamp, data: { id, name: id } });
  f.receive(claim("new", thirdId, 10000));
  f.receive(claim("old", peerId, 9999));
  f.receive(claim("tie-lower", peerId, 10000));
  assert.deepEqual(f.outputs.claims, [["new", 5000, false]]);
});
test("history paginates past claims and invalid texts to return the newest five valid messages", async context => {
  const text = number => ({ name: "text", clientId: peerId, timestamp: number, data: { id: String(number), name: "Alex", text: String(number) } });
  const second = { items: [text(4), text(3), text(2), text(1)], hasNext: () => false };
  const first = { items: [{ name: "claim", clientId: peerId, data: { id: "c", name: "Alex" } }, { ...text(7), data: { ...text(7).data, text: " " } }, text(6), text(5)], hasNext: () => true, next: async () => second };
  const f = fixture({ pages: [first] }); context.after(() => f.transport.close()); await f.transport.start();
  assert.deepEqual(f.outputs.messages.map(message => message.text), ["2", "3", "4", "5", "6"]);
  assert.equal(f.outputs.claims.length, 0);
});
