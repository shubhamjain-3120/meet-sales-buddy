import { createServer } from "node:http";
import { createService, PublicError } from "./service.js";

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
export function createTokenServer(config) {
  const service = createService(config);
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const route = new URL(request.url, "http://localhost").pathname;
    if (route === "/health" && request.method === "GET") {
      try { await config.store.room(); response.writeHead(200).end("OK"); }
      catch { response.writeHead(503).end("Room database unavailable."); }
      return;
    }
    if (request.method !== "POST" || !["/session", "/join", "/invite", "/token", "/profile", "/dashboard", "/revoke-invite", "/remove-member"].includes(route)) { response.writeHead(404).end(); return; }
    try {
      const body = await readBody(request);
      const credential = request.headers.authorization?.replace(/^Bearer /, "");
      let result;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new PublicError("Invalid request.");
      if (route === "/session") result = await service.create(body.name, credential, body.previousCredential);
      if (route === "/join") result = await service.join(body.name, body.inviteCode);
      if (route === "/invite") result = await service.invite(credential);
      if (route === "/token") result = await service.token(credential, body.meeting);
      if (route === "/profile") result = await service.profile(credential);
      if (route === "/dashboard") result = await service.dashboard(credential);
      if (route === "/revoke-invite") result = await service.revokeInvite(credential, body.id);
      if (route === "/remove-member") result = await service.remove(credential, body.id);
      response.writeHead(200, { "Content-Type": route === "/token" ? "text/plain" : "application/json" }).end(typeof result === "string" ? result : JSON.stringify(result));
    } catch (error) {
      const message = error instanceof PublicError ? error.message : error.message === "Request too large." ? error.message : error instanceof SyntaxError ? "Invalid request." : "Service unavailable. Retry.";
      response.writeHead(message === "Request too large." ? 413 : error instanceof PublicError ? error.status : error instanceof SyntaxError ? 400 : 503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: message }));
    }
  });
}
