import { Realtime } from "ably";

export function connect({ session, getToken, onConnection, onMessage, onClaim, onError, createClient = options => new Realtime(options), now = Date.now, timers = globalThis, uuid = () => crypto.randomUUID() }) {
  const client = createClient({ clientId: session.clientId, autoConnect: false, queueMessages: false, authCallback: (_params, callback) => getToken().then(token => callback(null, token), error => callback(error, null)) });
  const channel = client.channels.get(session.channel);
  const identity = new RegExp(`^${session.room}:[a-f0-9]{32}$`);
  let closed = false, started = false, presenceRevision = 0, historyPromise;
  let peers = new Map();
  let latestClaim;
  const seenClaims = new Set();
  const acknowledgements = new Map();
  const ready = () => !closed && client.connection.state === "connected" && channel.state === "attached";
  const emitConnection = () => { if (!closed) onConnection(ready(), peers.size ? [...peers.values()].join(", ") : null); };
  const other = id => identity.test(id ?? "") && id !== session.clientId;
  function fail(error) { if (!closed) onError(error?.message || "Could not connect to your room."); }
  async function refreshPresence() {
    const revision = ++presenceRevision;
    if (!ready()) { peers.clear(); emitConnection(); return; }
    try {
      const members = await channel.presence.get();
      if (closed || revision !== presenceRevision) return;
      peers = new Map(members.filter(member => other(member.clientId)).map(member => [member.clientId, typeof member.data?.name === "string" ? member.data.name.slice(0, 48) : "Member"]));
      emitConnection();
    } catch (error) { if (!closed && revision === presenceRevision) { peers.clear(); emitConnection(); fail(error); } }
  }
  function validEvent(message) {
    return identity.test(message.clientId ?? "") && message.data && typeof message.data.id === "string" && message.data.id.length <= 100;
  }
  function validText(message) {
    return validEvent(message) && typeof message.data.text === "string" && !!message.data.text.trim() && message.data.text.length <= 1000 && typeof message.data.name === "string";
  }
  function text(message) {
    if (!validText(message)) return false;
    onMessage({ id: message.data.id, name: message.data.name.slice(0, 48), text: message.data.text, own: message.clientId === session.clientId, timestamp: message.timestamp ?? now(), pending: false });
    return true;
  }
  function receive(message) {
    if (closed || !validEvent(message)) return;
    if (message.name === "receipt" && other(message.clientId)) {
      const pending = acknowledgements.get(message.data.id);
      if (pending) { timers.clearTimeout(pending.timer); acknowledgements.delete(message.data.id); pending.resolve(); }
      return;
    }
    if (message.name === "text") text(message);
    if (message.name === "claim" && typeof message.data.name === "string") {
      const key = `${message.clientId}:${message.data.id}`;
      const timestamp = message.timestamp ?? now();
      if (!seenClaims.has(key)) {
        seenClaims.add(key);
        if (seenClaims.size > 200) seenClaims.delete(seenClaims.values().next().value);
        const age = Math.max(0, now() - timestamp);
        if (age < 5000 && (!latestClaim || timestamp > latestClaim.timestamp || (timestamp === latestClaim.timestamp && key > latestClaim.key))) {
          latestClaim = { timestamp, key };
          onClaim(message.data.name.slice(0, 48), 5000 - age, message.clientId === session.clientId);
        }
      }
      if (other(message.clientId) && ready()) channel.publish("receipt", { id: message.data.id }).catch(() => {});
    }
  }
  async function refreshHistory() {
    if (closed || historyPromise) return historyPromise;
    historyPromise = (async () => {
      try {
        let page = await channel.history({ untilAttach: true, direction: "backwards", limit: 100 });
        const messages = [];
        while (page && !closed) {
          for (const message of page.items) if (message.name === "text" && validText(message)) messages.push(message);
          if (messages.length >= 5 || !page.hasNext()) break;
          page = await page.next();
        }
        for (const message of messages.slice(0, 5).reverse()) text(message);
      } catch (error) { fail(new Error(`Recent history couldn't load: ${error.message}`)); }
      finally { historyPromise = null; }
    })();
    return historyPromise;
  }
  client.connection.on(() => {
    if (!ready()) { peers.clear(); ++presenceRevision; emitConnection(); }
    else refreshPresence();
    if (["failed", "suspended"].includes(client.connection.state)) fail(client.connection.errorReason);
  });
  channel.on(change => { refreshPresence(); if (started && change.current === "attached" && !change.resumed) refreshHistory(); if (change.current === "failed") fail(channel.errorReason); });
  return {
    async start() {
      client.connect(); await channel.subscribe(receive);
      if (closed) return;
      await channel.presence.subscribe(refreshPresence);
      await channel.presence.enter({ name: session.name });
      started = true; await Promise.all([refreshPresence(), refreshHistory()]);
    },
    async send(value) {
      const text = value.trim();
      if (!ready() || !text || text.length > 1000) throw new Error("Message cannot be sent right now.");
      const message = { id: uuid(), name: session.name, text, timestamp: now(), own: true, pending: true };
      onMessage(message);
      try { await channel.publish("text", { id: message.id, name: session.name, text }); if (!closed) onMessage({ id: message.id, pending: false }); }
      catch (error) { if (!closed) onMessage({ id: message.id, pending: false, failed: true }); throw error; }
    },
    async claim() {
      if (!ready() || !peers.size) throw new Error("No other member is online.");
      const id = uuid();
      let resolve, reject;
      const received = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = timers.setTimeout(() => { acknowledgements.delete(id); reject(new Error("No member acknowledged the claim.")); }, 4000);
      acknowledgements.set(id, { resolve, reject, timer });
      try { await Promise.all([channel.publish("claim", { id, name: session.name }), received]); }
      finally { timers.clearTimeout(timer); acknowledgements.delete(id); }
    },
    close() {
      closed = true;
      for (const pending of acknowledgements.values()) { timers.clearTimeout(pending.timer); pending.reject(new Error("Room closed.")); }
      acknowledgements.clear(); channel.unsubscribe(receive); channel.presence.unsubscribe(refreshPresence); client.close();
    }
  };
}
globalThis.SalesBuddyRealtime = { connect };
