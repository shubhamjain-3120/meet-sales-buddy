(() => {
  const messages = ["Ask how many people will use it.", "I can walk them through pricing.", "Let's confirm the next step before wrapping up."];
  let index = 0;
  let online = true;
  const strip = SalesBuddyUI.mountStrip({
    name: "Shubham",
    onClaim() {},
    onSend(text) { strip.model.message({ id: crypto.randomUUID(), name: "Shubham", text, own: true, delivered: true }); },
    onSettings() { document.querySelector("#connection").click(); }
  });
  strip.model.connection(true, "Alex");
  document.querySelector("#partner-message").addEventListener("click", () => {
    if (online) strip.model.message({ id: crypto.randomUUID(), name: "Alex", text: messages[index++ % messages.length] });
  });
  document.querySelector("#partner-claim").addEventListener("click", () => { if (online) strip.model.claim("Alex"); });
  document.querySelector("#connection").addEventListener("click", event => {
    online = !online;
    strip.model.connection(true, online ? "Alex" : null);
    event.target.textContent = online ? "Disconnect partner" : "Reconnect partner";
  });
  strip.model.message({ id: "welcome", name: "Alex", text: "Ask how many people will use it." });
})();
