(() => {
  let strip;
  let transport;
  let revision = 0;
  let active = false;
  async function rpc(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (result.error) throw new Error(result.error);
    return result.data;
  }
  async function boot() {
    const current = ++revision;
    transport?.close();
    strip?.destroy();
    transport = null;
    strip = null;
    active = SalesBuddyCore.isMeetingLocation(location);
    if (!active) return;
    let session;
    try { session = await rpc({ type: "get-session" }); } catch { return; }
    if (revision !== current) return;
    const localStrip = SalesBuddyUI.mountStrip({
      name: session?.name ?? "You",
      onSettings: () => rpc({ type: "settings" }),
      onClaim: () => transport.claim(),
      onSend: text => transport.send(text),
      allowShortcut: () => SalesBuddyCore.isMeetingLocation(location)
    });
    strip = localStrip;
    if (!session) { localStrip.model.error("Click the red dot to set up your pairing"); return; }
    const currentTransport = SalesBuddyRealtime.connect({
      session, getToken: () => rpc({ type: "token" }),
      onConnection: (connected, partner) => localStrip.model.connection(connected, partner),
      onMessage: message => localStrip.model.message(message),
      onClaim: (name, duration, own) => localStrip.model.claim(name, duration, own),
      onError: error => localStrip.model.error(error)
    });
    transport = currentTransport;
    try { await currentTransport.start(); }
    catch (error) { if (revision === current) localStrip.model.error(error.message || "Unable to connect. Open settings to check your service."); }
  }
  chrome.runtime.onMessage.addListener(message => { if (message.type === "session-changed") boot(); });
  // Meet can navigate into/out of a call without a full page load.
  const routeTimer = setInterval(() => { if (active !== SalesBuddyCore.isMeetingLocation(location)) boot(); }, 1000);
  window.addEventListener("pagehide", () => { clearInterval(routeTimer); ++revision; transport?.close(); strip?.destroy(); });
  boot();
})();
