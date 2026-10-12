const SESSION_KEY = "buddySession";
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function endpoint(value) {
  const url = new URL(value);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTPS service URL (HTTP is allowed on localhost).");
  return url.href.replace(/\/$/, "");
}
async function request(base, route, body = {}, credential) {
  if (!await chrome.permissions.contains({ origins: [new URL(base).origin + "/*"] })) throw new Error("Allow access to your service in extension settings.");
  const response = await fetch(base + route, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Service unavailable. Retry."); }
  return route === "/token" ? response.text() : response.json();
}
function publicSession(session, meeting) {
  return session ? { name: session.name, role: session.role, room: session.room, clientId: session.clientId, channel: meeting ? `sales-buddy:${session.room}:${encodeURIComponent(meeting)}` : null } : null;
}
const encodeInvite = (base, code) => btoa(JSON.stringify({ version: 2, endpoint: base, code }));
async function handle(message, sender) {
  const trusted = sender.url?.startsWith(chrome.runtime.getURL(""));
  const meetUrl = sender.tab?.url ? new URL(sender.tab.url) : null;
  const meet = meetUrl?.hostname === "meet.google.com";
  if (!trusted && !meet) throw new Error("Unsupported page.");
  const meeting = meet ? meetUrl.pathname.slice(1).replace(/\/$/, "") : null;
  let session = (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY];
  if (session && !session.role && ["get-session", "token", "dashboard"].includes(message.type)) {
    const member = await request(session.endpoint, "/profile", {}, session.credential);
    session = { ...member, endpoint: session.endpoint };
    await chrome.storage.local.set({ [SESSION_KEY]: session });
  }
  if (message.type === "get-session") return publicSession(session, meeting);
  if (message.type === "settings") { await chrome.runtime.openOptionsPage(); return null; }
  if (message.type === "token") {
    if (!session) throw new Error("Set up or join your room first.");
    return request(session.endpoint, "/token", { meeting }, session.credential);
  }
  if (!trusted) throw new Error("Open extension settings to manage your room.");
  if (message.type === "create") {
    const base = endpoint(message.endpoint);
    const member = await request(base, "/session", { name: message.name, ...(session?.endpoint === base ? { previousCredential: session.credential } : {}) }, message.setupKey);
    session = { ...member, endpoint: base };
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return publicSession(session);
  }
  if (message.type === "join") {
    let invite;
    try { invite = JSON.parse(atob(message.invite.trim())); } catch { throw new Error("Invalid invite. Paste the complete code."); }
    if (invite.version !== 2 || typeof invite.code !== "string") throw new Error("Use a new single-room invite from the owner.");
    const base = endpoint(invite.endpoint);
    const member = await request(base, "/join", { name: message.name, inviteCode: invite.code });
    session = { ...member, endpoint: base };
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return publicSession(session);
  }
  if (message.type === "leave") { await chrome.storage.local.remove(SESSION_KEY); return null; }
  if (!session) throw new Error("Set up or join your room first.");
  if (message.type === "invite") {
    const invite = await request(session.endpoint, "/invite", {}, session.credential);
    return { id: invite.id, code: encodeInvite(session.endpoint, invite.inviteCode) };
  }
  const routes = { dashboard: "/dashboard", "revoke-invite": "/revoke-invite", "remove-member": "/remove-member" };
  if (routes[message.type]) return request(session.endpoint, routes[message.type], { id: message.id }, session.credential);
  throw new Error("Unknown request.");
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(data => sendResponse({ data }), error => sendResponse({ error: error.message || "Could not complete setup." }));
  return true;
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes[SESSION_KEY]) return;
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: "session-changed" }).catch(() => {});
});
