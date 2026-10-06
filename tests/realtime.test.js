import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "../extension/realtime.js";

const room = "sales-buddy:" + "a".repeat(32);
const session = { name: "Alex", clientId: "a".repeat(32) + ":host", channel: room };
const peerId = "a".repeat(32) + ":guest";
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  let receiver;
  let presenceListener;
  let channelListener;
  let connectionListener;
  const outputs = { connections: [], messages: [], claims: [], errors: [], publishes: [], historyCalls: [] };
  let members = [{ clientId: peerId, data: { name: "Alex" } }];
  const page = items => ({ items, hasNext: () => false, next: async () => null });
  const channel = {
    state: "attached",
    on(listener) { channelListener = listener; },
    async subscribe(listener) { receiver = listener; }, unsubscribe() {},
    history: async params => { outputs.historyCalls.push(params); return page(overrides.history ?? []); },
    publish: async (name, data) => {
      outputs.publishes.push({ name, data });
      if (overrides.publish) return overrides.publish(name, data, receiver);
      if (name === "claim") receiver({ name: "receipt", clientId: peerId, data: { id: data.id } });
    },
    presence: { async subscribe(listener) { presenceListener = listener; }, async get() { return members; }, async enter() {}, unsubscribe() {} }
  };
  const client = { connection: { state: "connected", on(listener) { connectionListener = listener; } }, channels: { get: requested => { assert.equal(requested, room); return channel; } }, connect() {}, close() {} };
  let clientOptions;
  let counter = 0;
  const transport = connect({
    session, getToken: async () => "jwt", createClient: options => { clientOptions = options; return client; }, uuid: () => `id-${++counter}`, now: () => 10000,
    onConnection: (connected, peer) => outputs.connections.push({ connected, peer }),
    onMessage: message => outputs.messages.push(message), onClaim: (...args) => outputs.claims.push(args), onError: error => outputs.errors.push(error)
  });
  return { transport, outputs, client, channel, get options() { return clientOptions; }, receive: message => receiver(message), async losePeer() { members = []; await presenceListener(); }, async reattach() { channelListener({ current: "attached", resumed: false }); await flush(); }, async disconnect() { client.connection.state = "disconnected"; connectionListener(); await flush(); } };
}
test("the adapter renews tokens via auth callback, enters presence, and disables offline queues", async context => {
  const f = fixture(); context.after(() => f.transport.close());
  await f.transport.start();
  assert.equal(f.options.queueMessages, false);
  assert.equal(await new Promise((resolve, reject) => f.options.authCallback({}, (error, token) => error ? reject(error) : resolve(token))), "jwt");
  assert.deepEqual(f.outputs.connections.at(-1), { connected: true, peer: "Alex" });
  await f.losePeer();
  assert.deepEqual(f.outputs.connections.at(-1), { connected: true, peer: null });
  await assert.rejects(f.transport.claim(), /offline/);
});
test("sending displays pending, server-accepted, and partner-delivered states using identities", async context => {
  const f = fixture(); context.after(() => f.transport.close()); await f.transport.start();
  await f.transport.send(" Hello ");
  assert.equal(f.outputs.messages[0].pending, true);
  assert.equal(f.outputs.messages.at(-1).pending, false);
  assert.equal(f.outputs.messages.at(-1).delivered, false);
  f.receive({ name: "receipt", clientId: "outsider", data: { id: "id-1" } });
  assert.equal(f.outputs.messages.at(-1).delivered, false);
  f.receive({ name: "receipt", clientId: peerId, data: { id: "id-1" } });
  assert.equal(f.outputs.messages.at(-1).delivered, true);
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
  f.receive(claim("second", session.clientId));
  assert.deepEqual(f.outputs.claims, [["Alex", 5000, false], ["Alex", 5000, true]]);
});
