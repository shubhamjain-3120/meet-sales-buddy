import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
export function sign(payload, secret, extraHeader = {}) {
  const input = `${encode({ alg: "HS256", typ: "JWT", ...extraHeader })}.${encode(payload)}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}
export function verify(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096) throw new Error("Invalid credential.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid credential.");
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = Buffer.from(parts[2], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid credential.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url"));
  if (header.alg !== "HS256" || (payload.exp !== undefined && payload.exp <= Math.floor(now / 1000))) throw new Error("Credential expired or invalid.");
  if (!/^[a-f0-9]{32}$/.test(payload.room)) throw new Error("Invalid room.");
  return payload;
}
function validName(name) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 48) throw new Error("Enter a name of 1–48 characters.");
  return name.trim();
}
export class PublicError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const hash = value => createHash("sha256").update(value).digest("hex");
const id = () => randomBytes(16).toString("hex");
export function channelFor(room, meeting) {
  if (typeof meeting !== "string" || !/^(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[^/]{1,100})$/.test(meeting)) throw new PublicError("Open a Google Meet call to connect.");
  return `sales-buddy:${room}:${encodeURIComponent(meeting)}`;
}
export function createService({ apiKey, sessionSecret, setupKey, store, now = Date.now, revoke }) {
  if (!/^[\w-]+\.[\w-]+:[^:]+$/.test(apiKey ?? "")) throw new Error("Set ABLY_API_KEY to a full Ably API key.");
  if (typeof sessionSecret !== "string" || sessionSecret.length < 32 || typeof setupKey !== "string" || setupKey.length < 24 || !store) throw new Error("Configure the secrets and room database.");
  const [keyId, keySecret] = apiKey.split(":");
  const safeName = name => { try { return validName(name); } catch (error) { throw new PublicError(error.message); } };
  const serialize = row => ({ name: row.name, room: row.room_id, role: row.role, clientId: `${row.room_id}:${row.id}`, credential: sign({ type: "member", v: 2, room: row.room_id, id: row.id }, sessionSecret) });
  function decoded(credential) {
    try { return verify(credential, sessionSecret, now()); }
    catch { throw new PublicError("Invalid membership. Set up or join again.", 401); }
  }
  async function authenticate(credential) {
    const payload = decoded(credential);
    if (payload.type !== "member") throw new PublicError("Invalid member credential.", 401);
    let row;
    if (payload.v === 2 && /^[a-f0-9]{32}$/.test(payload.id ?? "")) row = await store.member(payload.id);
    else if (["host", "guest"].includes(payload.role)) {
      // Preserve existing two-person memberships without rotating server secrets.
      const legacyHash = hash(credential);
      row = await store.legacyMember(legacyHash);
      if (!row) {
        let room = await store.room();
        if (!room && payload.role === "host") {
          row = await store.bootstrap(payload.room, { id: id(), name: safeName(payload.name), created_at: now() }, legacyHash);
          room = await store.room();
        }
        if (!room || room.id !== payload.room) throw new PublicError("Open the owner's settings first. If this is another old pairing, use a new room invite.", 409);
        if (!row && payload.role === "guest") row = await store.adoptMember({ id: id(), room_id: room.id, name: safeName(payload.name), created_at: now() }, legacyHash);
        if (!row && payload.role === "host") throw new PublicError("Recover your room using its setup key.", 409);
      }
    }
    if (!row || row.room_id !== payload.room) throw new PublicError("Invalid membership. Join with a new invite.", 401);
    if (row.revoked_at !== null) throw new PublicError("Your access was removed. Ask the owner for a new invite.", 403);
    return row;
  }
  async function owner(credential) {
    const row = await authenticate(credential);
    if (row.role !== "owner") throw new PublicError("Only the owner can manage this room.", 403);
    return row;
  }
  const revokeAccess = revoke ?? (async clientId => {
    const response = await fetch(`https://main.realtime.ably.net/keys/${keyId}/revokeTokens`, {
      method: "POST", signal: AbortSignal.timeout(10000), redirect: "error",
      headers: { authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`, "content-type": "application/json" },
      body: JSON.stringify({ targets: [`clientId:${clientId}`], allowReauthMargin: false })
    });
    if (!response.ok) throw new Error("Live revocation unavailable.");
  });
  return {
    async create(name, providedKey, previousCredential) {
      const expected = Buffer.from(setupKey), actual = Buffer.from(providedKey ?? "");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PublicError("Incorrect setup key.");
      const saved = await store.room();
      if (saved) return serialize(await store.member(saved.owner_id));
      if (previousCredential) {
        const previous = decoded(previousCredential);
        if (previous.type === "member" && previous.role === "host") return serialize(await authenticate(previousCredential));
      }
      return serialize(await store.bootstrap(id(), { id: id(), name: safeName(name), created_at: now() }));
    },
    async profile(credential) { return serialize(await authenticate(credential)); },
    async join(name, inviteCode) {
      if (typeof inviteCode !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(inviteCode)) throw new PublicError("Invalid invite. Ask the owner for a new code.");
      const row = await store.redeem(hash(inviteCode), { id: id(), name: safeName(name), created_at: now() });
      if (!row) throw new PublicError("This invite was used or revoked. Ask the owner for a new code.");
      return serialize(row);
    },
    async invite(credential) {
      const row = await owner(credential);
      const code = randomBytes(32).toString("base64url");
      const inviteId = id();
      await store.createInvite({ id: inviteId, room_id: row.room_id, code_hash: hash(code), created_at: now() });
      return { id: inviteId, inviteCode: code };
    },
    async dashboard(credential) {
      const row = await authenticate(credential);
      return row.role === "owner" ? store.dashboard(row.room_id) : { members: [], invites: [] };
    },
    async revokeInvite(credential, inviteId) {
      const row = await owner(credential);
      if (!await store.revokeInvite(row.room_id, inviteId, now())) throw new PublicError("Invite is missing or already used.");
      return { revoked: true };
    },
    async remove(credential, memberId) {
      const row = await owner(credential);
      if (!await store.removeMember(row.room_id, memberId, now())) throw new PublicError("Member not found, or you tried to remove the owner.");
      try {
        await revokeAccess(`${row.room_id}:${memberId}`);
        await store.finishRemoval(memberId);
        return { removed: true, pending: false };
      } catch { return { removed: true, pending: true }; }
    },
    async token(credential, meeting) {
      const row = await authenticate(credential);
      const seconds = Math.floor(now() / 1000);
      return sign({ iat: seconds, exp: seconds + 3600, "x-ably-clientId": `${row.room_id}:${row.id}`, "x-ably-capability": JSON.stringify({ [channelFor(row.room_id, meeting)]: ["publish", "subscribe", "presence", "history"] }) }, keySecret, { kid: keyId });
    }
  };
}
