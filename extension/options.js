const $ = id => document.getElementById(id);
let mode = "create", currentSession, latestInviteId;
async function rpc(message) { const result = await chrome.runtime.sendMessage(message); if (result.error) throw new Error(result.error); return result.data; }
function status(text, error = false) { $("status").textContent = text; $("status").classList.toggle("error", error); }
function showSession(session) {
  currentSession = session;
  $("active").hidden = !session;
  $("setup").hidden = Boolean(session);
  $("active-name").textContent = session?.name ?? "";
  const owner = session?.role === "owner";
  $("active-heading").textContent = owner ? "Your room ·" : "Joined as";
  $("owner-controls").hidden = !owner;
  $("recovery").hidden = !owner;
  $("invite-result").hidden = true;
  $("invite-output").value = "";
  $("invites").replaceChildren(); $("members").replaceChildren();
}
function row(label, action, handler) {
  const node = document.createElement("div"); node.className = "row";
  const text = document.createElement("span"); text.textContent = label; node.append(text);
  if (action) { const button = document.createElement("button"); button.type = "button"; button.textContent = action; button.addEventListener("click", () => handler(button)); node.append(button); }
  return node;
}
async function loadRoom(message = "") {
  if (!currentSession) return;
  status(message || "Loading room…");
  $("refresh").disabled = true;
  try {
    const data = await rpc({ type: "dashboard" });
    if (currentSession.role === "owner") {
      $("invites").replaceChildren(...data.invites.map(invite => {
        const state = invite.revoked_at !== null ? "Revoked" : invite.used_by ? "Used" : "Active";
        return row(`Invite ${invite.id.slice(0, 8)} · ${state}`, state === "Active" ? "Revoke" : null, async button => {
          if (!confirm("Revoke this invite? People who already joined remain members.")) return;
          await action(button, async () => {
            await rpc({ type: "revoke-invite", id: invite.id });
            if (invite.id === latestInviteId) { $("invite-output").value = ""; $("invite-result").hidden = true; }
            return "Invite revoked.";
          });
        });
      }));
      if (!data.invites.length) $("invites").textContent = "No invites yet.";
      $("members").replaceChildren(...data.members.map(member => {
        const state = member.role === "owner" ? "Owner" : member.removal_pending ? "Removed · live cutoff pending" : member.revoked_at !== null ? "Removed" : "Member";
        const label = member.role === "owner" || (member.revoked_at !== null && !member.removal_pending) ? null : member.removal_pending ? "Retry cutoff" : "Remove";
        return row(`${member.name} · ${state}`, label, async button => {
          if (!member.removal_pending && !confirm(`Remove ${member.name} from your room? They will need a new invite to join again.`)) return;
          await action(button, async () => { const result = await rpc({ type: "remove-member", id: member.id }); return result.pending ? "Membership revoked. Live cutoff is pending; retry it here." : "Member removed."; });
        });
      }));
    }
    status(message || "Your membership is saved.");
  } catch (error) { status(`${message ? message + " " : ""}${error.message}`, true); }
  finally { $("refresh").disabled = false; }
}
async function action(button, operation) {
  button.disabled = true;
  try { const message = await operation(); await loadRoom(message); }
  catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
}
for (const choice of ["create", "join"]) $(choice + "-mode").addEventListener("click", () => {
  mode = choice;
  for (const other of ["create", "join"]) { $(other + "-mode").setAttribute("aria-pressed", String(choice === other)); $(other + "-fields").hidden = choice !== other; }
  $("endpoint").required = choice === "create";
  $("submit").textContent = choice === "create" ? "Set up my room" : "Join room"; status("");
});
$("pair-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    let url;
    if (mode === "create") url = new URL($("endpoint").value.trim());
    else {
      try { url = new URL(JSON.parse(atob($("invite-input").value.trim())).endpoint); }
      catch { throw new Error("Invalid invite. Paste the complete code."); }
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS, or localhost for testing.");
    const allowed = await chrome.permissions.request({ origins: [url.origin + "/*"] });
    if (!allowed) throw new Error("Service access was declined. Try again to connect.");
    $("submit").disabled = true; status("Connecting…");
    const session = await rpc(mode === "create" ? { type: "create", name: $("name").value, endpoint: $("endpoint").value.trim(), setupKey: $("setup-key").value.trim() } : { type: "join", name: $("name").value, invite: $("invite-input").value });
    $("setup-key").value = ""; $("invite-input").value = ""; showSession(session); await loadRoom("Ready. Your membership is saved.");
  } catch (error) { status(error.message, true); }
  finally { $("submit").disabled = false; }
});
$("new-invite").addEventListener("click", () => action($("new-invite"), async () => {
  const invite = await rpc({ type: "invite" }); latestInviteId = invite.id;
  $("invite-result").hidden = false; $("invite-output").value = invite.code;
  return "Invite ready. Copy it and send it to one person.";
}));
$("copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("invite-output").value); status("Invite copied."); } catch { $("invite-output").select(); status("Select and copy the invite manually."); } });
$("refresh").addEventListener("click", () => loadRoom());
$("leave").addEventListener("click", async () => {
  if (!confirm("Remove setup from this browser? Your room and its other members remain. The owner can recover with the setup key; members need a new invite.")) return;
  try { await rpc({ type: "leave" }); showSession(null); status("Setup removed from this browser."); } catch (error) { status(error.message, true); }
});
rpc({ type: "get-session" }).then(async session => { showSession(session); await loadRoom(); }).catch(error => status(error.message, true));
