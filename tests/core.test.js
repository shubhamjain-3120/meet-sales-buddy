import { test } from "node:test";
import assert from "node:assert/strict";
import "../extension/core.js";
const { createState, isClaimKey, isMeetingLocation } = globalThis.SalesBuddyCore;

test("claims interrupt immediately, reset after five seconds, and renew for a new claim", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const model = createState(() => {});
  model.claim("Alex");
  assert.equal(model.state.claim, "Alex");
  context.mock.timers.tick(4_999);
  assert.equal(model.state.claim, "Alex");
  model.claim("Shubham");
  context.mock.timers.tick(1);
  assert.equal(model.state.claim, "Shubham");
  context.mock.timers.tick(4_999);
  assert.equal(model.state.claim, null);
});

test("history closes after thirty seconds without new messages extending it", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const model = createState(() => {});
  model.history(true);
  context.mock.timers.tick(29_000);
  model.message({ id: "new", name: "Alex", text: "New message" });
  assert.equal(model.state.historyOpen, true);
  context.mock.timers.tick(1_000);
  assert.equal(model.state.historyOpen, false);
  model.history(true);
  model.history(false);
  context.mock.timers.tick(10_000);
  model.history(true);
  context.mock.timers.tick(20_000);
  assert.equal(model.state.historyOpen, true);
  context.mock.timers.tick(10_000);
  assert.equal(model.state.historyOpen, false);
});

test("acknowledging your own message doesn't duplicate or reorder conversation", () => {
  const model = createState(() => {});
  model.message({ id: "one", name: "You", text: "Hi", pending: true });
  model.message({ id: "two", name: "Alex", text: "Hello" });
  model.message({ id: "one", pending: false });
  assert.equal(model.state.messages.length, 2);
  assert.equal(model.state.messages.at(-1).id, "two");
  assert.equal(model.state.messages[0].pending, false);
});

test("losing the partner clears stale claim feedback", () => {
  const model = createState(() => {});
  model.connection(true, "Alex");
  model.claim("Alex");
  model.connection(true, null);
  assert.equal(model.state.claim, null);
  model.destroy();
});

test("history catch-up never replaces the latest live message and late claims use only their remaining time", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const model = createState(() => {});
  model.message({ id: "live", text: "Latest", timestamp: 3000 });
  model.message({ id: "old", text: "History", timestamp: 1000 });
  model.message({ id: "middle", text: "History", timestamp: 2000 });
  assert.equal(model.state.messages.at(-1).id, "live");
  model.claim("Alex", 1000);
  context.mock.timers.tick(1000);
  assert.equal(model.state.claim, null);
});

test("claim shortcut rejects typing, composition, repeat, and modifiers", () => {
  const event = { key: "`", target: { closest: () => null } };
  assert.equal(isClaimKey(event), true);
  for (const flag of ["repeat", "isComposing", "ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(isClaimKey({ ...event, [flag]: true }), false);
  assert.equal(isClaimKey({ ...event, key: "c" }), false);
  assert.equal(isClaimKey({ ...event, composedPath: () => [{ closest: () => ({}) }] }), false);
});

test("extension only treats Google Meet meeting routes as eligible", () => {
  assert.equal(isMeetingLocation(new URL("https://meet.google.com/abc-defg-hij")), true);
  assert.equal(isMeetingLocation(new URL("https://meet.google.com/lookup/sales")), true);
  assert.equal(isMeetingLocation(new URL("https://meet.google.com/")), false);
  assert.equal(isMeetingLocation(new URL("https://example.com/abc-defg-hij")), false);
});
