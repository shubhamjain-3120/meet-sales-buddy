const $ = id => document.getElementById(id);
let mode = "create";
async function rpc(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result.error) throw new Error(result.error);
  return result.data;
}
function status(text, error = false) { $("status").textContent = text; $("status").classList.toggle("error", error); }
function showSession(session) {
  $("active").hidden = !session;
  $("setup").hidden = Boolean(session);
  $("active-name").textContent = session?.name ?? "";
  $("new-invite").hidden = !session?.clientId.endsWith(":host");
  $("invite-result").hidden = true;
  $("invite-output").value = "";
}
function showInvite(invite) { $("invite-result").hidden = false; $("invite-output").value = invite; }
for (const choice of ["create", "join"]) $(choice + "-mode").addEventListener("click", () => {
  mode = choice;
  for (const other of ["create", "join"]) { $(other + "-mode").setAttribute("aria-pressed", String(choice === other)); $(other + "-fields").hidden = choice !== other; }
  $("submit").textContent = choice === "create" ? "Create pairing" : "Join pairing";
  status("");
});
$("pair-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    let serviceUrl;
    if (mode === "create") serviceUrl = new URL($("endpoint").value.trim());
    else serviceUrl = new URL(JSON.parse(atob($("invite-input").value.trim())).endpoint);
    if (serviceUrl.protocol !== "https:" && !(serviceUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(serviceUrl.hostname))) throw new Error("Use HTTPS, or localhost for testing.");
    // Request the chosen origin directly during the submit gesture.
    const allowed = await chrome.permissions.request({ origins: [serviceUrl.origin + "/*"] });
    if (!allowed) throw new Error("Service access was declined. Try again to connect.");
    $("submit").disabled = true;
    status("Connecting…");
    const session = await rpc(mode === "create" ? { type: "create", name: $("name").value, endpoint: $("endpoint").value.trim(), setupKey: $("setup-key").value } : { type: "join", name: $("name").value, invite: $("invite-input").value });
    $("setup-key").value = "";
    $("invite-input").value = "";
    showSession(session);
    if (session.invite) showInvite(session.invite);
    status("Ready. Your pairing is saved.");
  } catch (error) { status(error instanceof SyntaxError ? "The invite is invalid. Paste the complete invite." : error.message, true); }
  finally { $("submit").disabled = false; }
});
$("new-invite").addEventListener("click", async () => {
  try { showInvite(await rpc({ type: "invite" })); status("Invite ready."); }
  catch (error) { status(error.message, true); }
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("invite-output").value); status("Invite copied."); }
  catch { $("invite-output").select(); status("Select and copy the invite manually."); }
});
$("leave").addEventListener("click", async () => {
  try { await rpc({ type: "leave" }); showSession(null); status("Pairing removed from this browser."); }
  catch (error) { status(error.message, true); }
});
rpc({ type: "get-session" }).then(showSession).catch(error => status(error.message, true));
