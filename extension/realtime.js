import { Realtime } from "ably";

export function connect({ session, getToken, onConnection, onMessage, onClaim, onError, createClient = options => new Realtime(options), now = Date.now, timers = globalThis, uuid = () => crypto.randomUUID() }) {
  const client = createClient({
    clientId: session.clientId, autoConnect: false, queueMessages: false,
    authCallback: (_params, callback) => getToken().then(token => callback(null, token), error => callback(error, null))
  });
  const channel = client.channels.get(session.channel);
  const partnerId = session.clientId.replace(/:(host|guest)$/, (_, role) => role === "host" ? ":guest" : ":host");
  let closed = false;
  let started = false;
  let peer = null;
  let presenceRevision = 0;
  let historyPromise;
  const seenClaims = new Set();
  const acknowledgements = new Map();
  const sentMessages = new Map();
  const ready = () => !closed && client.connection.state === "connected" && channel.state === "attached";
  const emitConnection = () => { if (!closed) onConnection(ready(), peer); };
  function fail(error) { if (!closed) onError(error?.message || "Could not connect to your private channel."); }
  async function refreshPresence() {
    const revision = ++presenceRevision;
    if (!ready()) { peer = null; emitConnection(); return; }
    try {
      const members = await channel.presence.get();
      if (closed || revision !== presenceRevision) return;
      const member = members.find(item => item.clientId === partnerId);
      peer = typeof member?.data?.name === "string" ? member.data.name.slice(0, 48) : member ? "Partner" : null;
      emitConnection();
    } catch (error) { if (!closed && revision === presenceRevision) { peer = null; emitConnection(); fail(error); } }
  }
  function validEvent(message) {
    const data = message.data;
    return [session.clientId, partnerId].includes(message.clientId) && data && typeof data.id === "string" && data.id.length <= 100;
  }
  function text(message) {
    if (!validEvent(message) || typeof message.data.text !== "string" || !message.data.text.trim() || message.data.text.length > 1000 || typeof message.data.name !== "string") return;
    onMessage({ id: message.data.id, name: message.data.name.slice(0, 48), text: message.data.text, own: message.clientId === session.clientId, timestamp: message.timestamp ?? now(), pending: false });
  }
  function receipt(message) {
    if (message.clientId !== partnerId || typeof message.data?.id !== "string") return;
    const pending = acknowledgements.get(message.data.id);
    if (pending) { timers.clearTimeout(pending.timer); acknowledgements.delete(message.data.id); pending.resolve(); }
    const sent = sentMessages.get(message.data.id);
    if (sent) { onMessage({ ...sent, pending: false, delivered: true }); sentMessages.delete(message.data.id); }
  }
  function receive(message) {
    if (closed) return;
    if (message.name === "receipt") { receipt(message); return; }
    if (!validEvent(message)) return;
    if (message.name === "text") text(message);
    if (message.name === "claim" && typeof message.data.name === "string" && !seenClaims.has(message.data.id)) {
      seenClaims.add(message.data.id);
      if (seenClaims.size > 200) seenClaims.delete(seenClaims.values().next().value);
      const age = Math.max(0, now() - (message.timestamp ?? now()));
      if (age < 5000) onClaim(message.data.name.slice(0, 48), 5000 - age, message.clientId === session.clientId);
    }
    if (["text", "claim"].includes(message.name) && message.clientId === partnerId && ready()) {
      channel.publish("receipt", { id: message.data.id }).catch(() => {});
    }
  }
  async function refreshHistory() {
    if (closed || historyPromise) return historyPromise;
    historyPromise = (async () => {
      try {
        let page = await channel.history({ untilAttach: true, direction: "backwards", limit: 100 });
        while (page && !closed) {
          for (const message of [...page.items].reverse()) if (message.name === "text") text(message);
          page = page.hasNext() ? await page.next() : null;
        }
      } catch (error) { fail(new Error(`Recent history couldn't load: ${error.message}`)); }
      finally { historyPromise = null; }
    })();
    return historyPromise;
  }
  client.connection.on(() => {
    if (!ready()) { peer = null; ++presenceRevision; emitConnection(); }
    else refreshPresence();
    if (["failed", "suspended"].includes(client.connection.state)) fail(client.connection.errorReason);
  });
  channel.on(change => {
    refreshPresence();
    if (started && change.current === "attached" && !change.resumed) refreshHistory();
    if (change.current === "failed") fail(channel.errorReason);
  });
  return {
    async start() {
      client.connect();
      await channel.subscribe(receive);
      if (closed) return;
      await channel.presence.subscribe(refreshPresence);
      await channel.presence.enter({ name: session.name });
      started = true;
      await Promise.all([refreshPresence(), refreshHistory()]);
    },
    async send(value) {
      const valueText = value.trim();
      if (!ready() || !valueText || valueText.length > 1000) throw new Error("Message cannot be sent right now.");
      const message = { id: uuid(), name: session.name, text: valueText, timestamp: now(), own: true, pending: true, delivered: false };
      sentMessages.set(message.id, message);
      if (sentMessages.size > 200) sentMessages.delete(sentMessages.keys().next().value);
      onMessage(message);
      try {
        await channel.publish("text", { id: message.id, name: message.name, text: message.text });
        if (!closed) onMessage({ ...message, pending: false, delivered: !sentMessages.has(message.id) });
      } catch (error) {
        sentMessages.delete(message.id);
        if (!closed) onMessage({ ...message, pending: false, failed: true });
        throw error;
      }
    },
    async claim() {
      if (!ready() || !peer) throw new Error("Partner is offline.");
      const id = uuid();
      let resolve, reject;
      const received = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = timers.setTimeout(() => { acknowledgements.delete(id); reject(new Error("Partner didn't acknowledge the claim.")); }, 4000);
      acknowledgements.set(id, { resolve, reject, timer });
      try { await Promise.all([channel.publish("claim", { id, name: session.name }), received]); }
      finally { timers.clearTimeout(timer); acknowledgements.delete(id); }
    },
    close() {
      closed = true;
      for (const pending of acknowledgements.values()) { timers.clearTimeout(pending.timer); pending.reject(new Error("Pairing closed.")); }
      acknowledgements.clear();
      sentMessages.clear();
      channel.unsubscribe(receive);
      channel.presence.unsubscribe(refreshPresence);
      client.close();
    }
  };
}
globalThis.SalesBuddyRealtime = { connect };
