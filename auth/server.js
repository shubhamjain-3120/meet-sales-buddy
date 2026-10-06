import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createService } from "./service.js";

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
    if (route === "/health" && request.method === "GET") { response.writeHead(200).end("OK"); return; }
    if (request.method !== "POST" || !["/session", "/join", "/invite", "/token"].includes(route)) { response.writeHead(404).end(); return; }
    try {
      const body = await readBody(request);
      const credential = request.headers.authorization?.replace(/^Bearer /, "");
      let result;
      if (route === "/session") result = service.create(body.name, credential);
      if (route === "/join") result = service.join(body.name, body.inviteCode);
      if (route === "/invite") result = service.invite(credential);
      if (route === "/token") result = service.token(credential);
      response.writeHead(200, { "Content-Type": route === "/token" ? "text/plain" : "application/json" }).end(typeof result === "string" ? result : JSON.stringify(result));
    } catch (error) {
      const message = error instanceof SyntaxError || error instanceof TypeError ? "Invalid request." : error.message;
      response.writeHead(message === "Request too large." ? 413 : 400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: message }));
    }
  });
}
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createTokenServer({ apiKey: process.env.ABLY_API_KEY, sessionSecret: process.env.SESSION_SECRET, setupKey: process.env.SETUP_KEY });
  const port = Number(process.env.AUTH_PORT || process.env.PORT || 8787);
  server.listen(port, process.env.AUTH_HOST || "127.0.0.1", () => console.log(`Token service listening on port ${port}`));
}
