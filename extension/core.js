(() => {
  const CLAIM_MS = 5_000;
  const HISTORY_MS = 30_000;

  function isMeetingLocation(location) {
    return location.hostname === "meet.google.com" &&
      /^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[^/]+)\/?$/.test(location.pathname);
  }

  function isClaimKey(event) {
    const target = event.composedPath?.()[0] ?? event.target;
    return event.key === "`" && !event.repeat && !event.isComposing &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']");
  }

  function createState(onChange, timers = globalThis) {
    const state = { connected: false, partner: null, messages: [], claim: null, claimOwn: false, historyOpen: false, error: "" };
    let claimTimer;
    let historyTimer;
    const notify = () => onChange(state);

    return {
      state,
      connection(connected, partner = null) {
        state.connected = connected;
        state.partner = partner;
        if (!connected || !partner) {
          timers.clearTimeout(claimTimer);
          state.claim = null;
        }
        notify();
      },
      message(message) {
        const existing = state.messages.findIndex(item => item.id === message.id);
        if (existing === -1) state.messages.push(message);
        else state.messages[existing] = { ...state.messages[existing], ...message };
        state.messages.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        state.error = "";
        notify();
      },
      replaceMessages(messages) {
        state.messages = [...messages];
        notify();
      },
      claim(name, duration = CLAIM_MS, own = false) {
        timers.clearTimeout(claimTimer);
        state.claim = name;
        state.claimOwn = own;
        state.error = "";
        notify();
        claimTimer = timers.setTimeout(() => {
          state.claim = null;
          notify();
        }, duration);
      },
      clearClaim() {
        timers.clearTimeout(claimTimer);
        state.claim = null;
        notify();
      },
      history(open = !state.historyOpen) {
        timers.clearTimeout(historyTimer);
        state.historyOpen = open;
        notify();
        if (open) historyTimer = timers.setTimeout(() => {
          state.historyOpen = false;
          notify();
        }, HISTORY_MS);
      },
      error(message) {
        state.error = message;
        notify();
      },
      destroy() {
        timers.clearTimeout(claimTimer);
        timers.clearTimeout(historyTimer);
      }
    };
  }

  globalThis.SalesBuddyCore = { CLAIM_MS, HISTORY_MS, createState, isClaimKey, isMeetingLocation };
})();
