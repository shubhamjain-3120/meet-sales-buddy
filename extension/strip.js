(() => {
  const CSS = `
    :host { all: initial; position: fixed; z-index: 2147483646; top: 10px; left: 12px; right: 12px; pointer-events: none; color-scheme: dark; }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: default; opacity: .45; }
    .wrap { position: relative; width: min(720px, calc(100vw - 440px)); max-width: 100%; margin: auto; font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e8eaf0; pointer-events: auto; }
    .strip { display: flex; align-items: center; gap: 8px; height: 38px; padding: 5px 8px; background: #20242b; border: 1px solid #41464f; border-radius: 9px; box-shadow: 0 6px 22px #0003; }
    .strip.claimed { background: #12613f; border-color: #55df99; box-shadow: 0 0 0 2px #55df9940, 0 6px 22px #0003; }
    .status { width: 16px; height: 26px; flex: 0 0 16px; border: 0; background: transparent; padding: 0; display: grid; place-items: center; border-radius: 5px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #ed7678; }
    .online .dot { background: #59d699; }
    .claim { height: 26px; flex: 0 0 auto; display: flex; gap: 6px; align-items: center; border: 1px solid #565b65; border-radius: 6px; padding: 0 8px; background: #303640; color: #f5f6f8; font-weight: 600; }
    .claim:hover:enabled { background: #3d4551; }
    .claimed .claim { background: #164f37; border-color: #6eca9f; }
    kbd { font: 10px/1 monospace; color: #c0c6cf; border: 1px solid #656c77; border-radius: 3px; min-width: 13px; height: 14px; display: grid; place-items: center; }
    .latest { min-width: 0; flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #d7dbe3; padding: 4px 6px; margin-left: -6px; border-radius: 6px; transition: background-color 120ms ease-out, box-shadow 120ms ease-out; }
    .latest strong { color: #f1f3f6; font-weight: 600; }
    .latest.empty { color: #969da9; }
    .latest.claim-text { font-size: 13px; font-weight: 700; color: #fff; }
    .latest.error { color: #ffc1bd; }
    .latest.fresh { background: #f4ce55; color: #29230f; box-shadow: inset 0 0 0 1px #ffeb96; animation: message-arrive 180ms ease-out; }
    .latest.fresh strong { color: inherit; }
    .latest.fresh .delivery { color: #625018; }
    @keyframes message-arrive { from { opacity: .45; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
    .delivery { color: #969da9; margin-left: 6px; font-size: 11px; }
    .history-toggle { display: grid; place-items: center; height: 26px; width: 26px; flex: 0 0 26px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #aeb8c8; }
    .history-toggle:hover, .history-toggle[aria-expanded='true'] { background: #ffffff0d; border-color: #ffffff18; color: #edf0f5; }
    .chevron { display: block; width: 16px; height: 16px; }
    .history-toggle[aria-expanded='true'] .chevron { transform: rotate(180deg); }
    .composer { position: relative; flex: 0 1 200px; min-width: 130px; border-left: 1px solid #4b5059; padding-left: 8px; }
    input { width: 100%; height: 26px; outline: none; border: 1px solid #535a65; border-radius: 6px; background: #171b22; color: #f3f4f7; padding: 0 26px 0 8px; }
    input::placeholder { color: #a0a7b4; }
    input:focus { border-color: #a0b9eb; box-shadow: 0 0 0 2px #a0b9eb25; }
    .enter { pointer-events: none; position: absolute; right: 8px; top: 3px; color: #929cac; font: 14px/20px sans-serif; }
    .history { position: absolute; top: 44px; left: 0; right: 0; max-height: min(280px, 55vh); overflow: auto; padding: 10px 14px; background: #20242b; border: 1px solid #41464f; border-radius: 9px; box-shadow: 0 8px 28px #0004; }
    .history[hidden] { display: none; }
    .history-head { display: flex; justify-content: space-between; align-items: center; color: #aeb6c4; font-size: 12px; margin-bottom: 10px; }
    .history-head span:last-child { color: #808998; }
    .message { display: grid; grid-template-columns: 110px 1fr; gap: 12px; padding: 7px 0; }
    .message .name { color: #aeb9cd; overflow-wrap: anywhere; }
    .message .text { color: #e4e8f0; overflow-wrap: anywhere; white-space: pre-wrap; }
    .history-empty { color: #969da9; margin: 12px 0; }
    :focus-visible { outline: 2px solid #a0b9eb; outline-offset: 2px; }
    @media (max-width: 960px) { :host { top: 64px; } .wrap { width: min(720px, 100%); } }
    @media (max-width: 680px) { .strip { gap: 6px; } .composer { flex-basis: 160px; min-width: 100px; padding-left: 6px; } .claim { padding: 0 7px; } kbd { display: none; } }
    @media (prefers-reduced-motion: reduce) { .latest { transition: none; } .latest.fresh { animation: none; } }
  `;

  function mountStrip({ parent = document.body, name, onClaim, onSend, onSettings, allowShortcut = () => true }) {
    const host = document.createElement("div");
    host.id = "sales-buddy-strip";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <section class="wrap" aria-label="Private sales coordination">
        <div class="strip">
          <button class="status" type="button" aria-label="Connection settings" title="Partner offline — open settings"><span class="dot"></span></button>
          <button class="claim" type="button" disabled title="Claim this question (backtick)">Claim <kbd>&#96;</kbd></button>
          <div class="latest empty" role="status" aria-live="polite">No messages yet</div>
          <button class="history-toggle" type="button" aria-label="View message history" aria-expanded="false" aria-controls="buddy-history"><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></button>
          <form class="composer"><input type="text" maxlength="1000" aria-label="Message your partner" placeholder="Message partner…" autocomplete="off" disabled><span class="enter" aria-hidden="true">↵</span></form>
        </div>
        <section class="history" id="buddy-history" aria-label="Message history" hidden>
          <div class="history-head"><span>Last 5 messages</span><span>Closes after 30s</span></div>
          <div class="messages"></div>
        </section>
      </section>`;
    parent.append(host);
    const $ = selector => root.querySelector(selector);
    let lastMessageId;
    let highlightTimer;
    let lastHistorySignature;
    let busy = false;
    let claimRequest = 0;
    const own = message => message.own ?? message.name === name;
    const model = SalesBuddyCore.createState(render);

    function render(state) {
      $(".strip").classList.toggle("claimed", Boolean(state.claim));
      $(".status").classList.toggle("online", Boolean(state.connected && state.partner));
      $(".status").title = state.connected ? state.partner ? `${state.partner} connected — open settings` : "Waiting for partner — open settings" : "Disconnected — open settings";
      $(".status").setAttribute("aria-label", $(".status").title);
      $(".claim").disabled = !state.connected || !state.partner;
      $("input").disabled = !state.connected;
      const latest = state.messages.at(-1);
      const node = $(".latest");
      node.classList.toggle("empty", !latest && !state.claim && !state.error);
      node.classList.toggle("claim-text", Boolean(state.claim));
      node.classList.toggle("error", Boolean(state.error && !state.claim));
      node.setAttribute("aria-live", state.claim ? "assertive" : "polite");
      node.replaceChildren();
      if (state.claim) {
        node.textContent = `${state.claimOwn ? "You" : state.claim} — I'll take this`;
      } else if (state.error) {
        node.textContent = state.error;
      } else if (latest) {
        const sender = document.createElement("strong");
        sender.textContent = `${own(latest) ? "You" : latest.name}: `;
        node.append(sender, document.createTextNode(latest.text));
        if (own(latest)) {
          const pending = document.createElement("span");
          pending.className = "delivery";
          pending.textContent = latest.failed ? "Failed" : latest.pending ? "Sending…" : "Sent";
          node.append(pending);
        }
      } else {
        node.textContent = "No messages yet";
      }
      node.title = node.textContent;
      if (state.claim || state.error || !latest) {
        clearTimeout(highlightTimer);
        node.classList.remove("fresh");
      } else if (latest.id !== lastMessageId) {
        clearTimeout(highlightTimer);
        node.classList.remove("fresh");
        void node.offsetWidth;
        node.classList.add("fresh");
        highlightTimer = setTimeout(() => node.classList.remove("fresh"), 1500);
      }
      if (!state.claim && !state.error && latest) lastMessageId = latest.id;
      $(".history").hidden = !state.historyOpen;
      $(".history-toggle").setAttribute("aria-expanded", String(state.historyOpen));
      $(".history-toggle").setAttribute("aria-label", state.historyOpen ? "Close message history" : "View message history");
      const historyMessages = state.messages.slice(-5);
      const signature = JSON.stringify(historyMessages);
      if (signature !== lastHistorySignature) {
        $(".messages").replaceChildren();
        if (!historyMessages.length) {
          const empty = document.createElement("p");
          empty.className = "history-empty";
          empty.textContent = "No messages yet. Use the text box above to send one.";
          $(".messages").append(empty);
        }
        for (const message of historyMessages) {
          const row = document.createElement("div");
          row.className = "message";
          const sender = document.createElement("span");
          sender.className = "name";
          sender.textContent = own(message) ? "You" : message.name;
          const text = document.createElement("span");
          text.className = "text";
          text.textContent = message.text + (message.failed ? " · Failed" : message.pending ? " · Sending…" : "");
          row.append(sender, text);
          $(".messages").append(row);
        }
        lastHistorySignature = signature;
        if (state.historyOpen) $(".history").scrollTop = $(".history").scrollHeight;
      }
    }

    function claim() {
      if (!model.state.connected || !model.state.partner) return;
      const request = ++claimRequest;
      model.claim(name, SalesBuddyCore.CLAIM_MS, true);
      Promise.resolve().then(onClaim).catch(() => {
        if (request !== claimRequest || !host.isConnected || !model.state.claimOwn) return;
        model.clearClaim();
        model.error("Claim wasn't confirmed. Try again.");
      });
    }
    $(".claim").addEventListener("click", claim);
    $(".status").addEventListener("click", () => onSettings?.());
    $(".history-toggle").addEventListener("click", () => model.history());
    $(".composer").addEventListener("submit", async event => {
      event.preventDefault();
      const input = $("input");
      const text = input.value.trim();
      if (!text || !model.state.connected || busy) return;
      busy = true;
      const original = input.value;
      input.value = "";
      try { await onSend(text); }
      catch {
        if (!input.value) input.value = original;
        model.error("Message wasn't sent. Your draft is kept.");
      } finally { busy = false; }
    });
    $("input").addEventListener("keydown", event => {
      // Keep Meet from treating composer keystrokes as meeting shortcuts.
      event.stopPropagation();
      if (event.key === "Enter" && (event.isComposing || event.repeat)) event.preventDefault();
    });
    const keyListener = event => {
      if (model.state.connected && model.state.partner && allowShortcut() && document.hasFocus() && !document.hidden && SalesBuddyCore.isClaimKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        claim();
      }
    };
    document.addEventListener("keydown", keyListener, true);
    const escapeListener = event => {
      if (event.key === "Escape" && model.state.historyOpen) { model.history(false); event.stopPropagation(); }
    };
    root.addEventListener("keydown", escapeListener);
    render(model.state);
    return { host, root, model, destroy() { clearTimeout(highlightTimer); model.destroy(); host.remove(); document.removeEventListener("keydown", keyListener, true); } };
  }
  globalThis.SalesBuddyUI = { mountStrip };
})();
