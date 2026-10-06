const SESSION_KEY = "buddySession";
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

function endpoint(value) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTPS token-service URL (HTTP is allowed on localhost).");
  return url.href.replace(/\/$/, "");
}
async function request(base, route, body = {}, credential) {
  const allowed = await chrome.permissions.contains({ origins: [new URL(base).origin + "/*"] });
  if (!allowed) throw new Error("Allow access to your token service in extension settings.");
  const response = await fetch(base + route, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Token service could not complete the request.");
  }
  return route === "/token" ? response.text() : response.json();
}
function publicSession(session) {
  return session ? { name: session.name, clientId: session.clientId, channel: session.channel } : null;
}
const encodeInvite = (base, code) => btoa(JSON.stringify({ version: 1, endpoint: base, code }));

async function handle(message, sender) {
  const trusted = sender.url?.startsWith(chrome.runtime.getURL(""));
  const meet = sender.tab?.url && new URL(sender.tab.url).hostname === "meet.google.com";
  if (!trusted && !meet) throw new Error("Unsupported page.");
  const session = (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY];
  if (message.type === "get-session") return publicSession(session);
  if (message.type === "settings") { await chrome.runtime.openOptionsPage(); return null; }
  if (message.type === "token") {
    if (!session) throw new Error("Set up your private pairing first.");
    return request(session.endpoint, "/token", {}, session.credential);
  }
  if (!trusted) throw new Error("Open extension settings to manage pairing.");
  if (message.type === "create") {
    const base = endpoint(message.endpoint);
    const result = await request(base, "/session", { name: message.name }, message.setupKey);
    const { inviteCode, ...member } = result;
    await chrome.storage.local.set({ [SESSION_KEY]: { ...member, endpoint: base } });
    return { ...publicSession(member), invite: encodeInvite(base, inviteCode) };
  }
  if (message.type === "join") {
    const invite = JSON.parse(atob(message.invite.trim()));
    if (invite.version !== 1 || typeof invite.code !== "string") throw new Error("Invalid invite.");
    const base = endpoint(invite.endpoint);
    const member = await request(base, "/join", { name: message.name, inviteCode: invite.code });
    await chrome.storage.local.set({ [SESSION_KEY]: { ...member, endpoint: base } });
    return publicSession(member);
  }
  if (message.type === "invite") {
    if (!session || !session.clientId.endsWith(":host")) throw new Error("Only the person who created the pairing can invite a partner.");
    const { inviteCode } = await request(session.endpoint, "/invite", {}, session.credential);
    return encodeInvite(session.endpoint, inviteCode);
  }
  if (message.type === "leave") { await chrome.storage.local.remove(SESSION_KEY); return null; }
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
