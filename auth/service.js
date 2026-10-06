import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
export function createService({ apiKey, sessionSecret, setupKey, now = Date.now }) {
  if (!/^[\w-]+\.[\w-]+:[^:]+$/.test(apiKey ?? "")) throw new Error("Set ABLY_API_KEY to a full Ably API key.");
  if (typeof sessionSecret !== "string" || sessionSecret.length < 32 || typeof setupKey !== "string" || setupKey.length < 24) throw new Error("Use a SESSION_SECRET of at least 32 characters and SETUP_KEY of at least 24 characters.");
  const [keyId, keySecret] = apiKey.split(":");
  function member(payload) {
    return { name: payload.name, clientId: `${payload.room}:${payload.role}`, channel: `sales-buddy:${payload.room}`, credential: sign(payload, sessionSecret) };
  }
  function readMember(credential) {
    const payload = verify(credential, sessionSecret, now());
    if (payload.type !== "member" || !["host", "guest"].includes(payload.role)) throw new Error("Invalid member credential.");
    validName(payload.name);
    return payload;
  }
  function invite(payload) {
    return sign({ type: "invite", room: payload.room, exp: Math.floor(now() / 1000) + 86400 }, sessionSecret);
  }
  return {
    create(name, providedKey) {
      const expected = Buffer.from(setupKey);
      const actual = Buffer.from(providedKey ?? "");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Incorrect setup key.");
      const payload = { type: "member", room: randomBytes(16).toString("hex"), role: "host", name: validName(name) };
      return { ...member(payload), inviteCode: invite(payload) };
    },
    join(name, inviteCode) {
      const payload = verify(inviteCode, sessionSecret, now());
      if (payload.type !== "invite") throw new Error("Invalid invite.");
      return member({ type: "member", room: payload.room, role: "guest", name: validName(name) });
    },
    invite(credential) {
      const payload = readMember(credential);
      if (payload.role !== "host") throw new Error("Only the creator can generate an invite.");
      return { inviteCode: invite(payload) };
    },
    token(credential) {
      const payload = readMember(credential);
      const seconds = Math.floor(now() / 1000);
      return sign({ iat: seconds, exp: seconds + 3600, "x-ably-clientId": `${payload.room}:${payload.role}`, "x-ably-capability": JSON.stringify({ [`sales-buddy:${payload.room}`]: ["publish", "subscribe", "presence", "history"] }) }, keySecret, { kid: keyId });
    }
  };
}
