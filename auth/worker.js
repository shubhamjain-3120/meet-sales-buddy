import { httpServerHandler } from "cloudflare:node";
import { createTokenServer } from "./server.js";
import { createStore } from "./store.js";
import privacyPolicy from "../store/privacy.html";

let handler;
export default {
  fetch(request, env, context) {
    if (new URL(request.url).pathname === "/privacy" && ["GET", "HEAD"].includes(request.method)) {
      return new Response(request.method === "HEAD" ? null : privacyPolicy, { headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
      } });
    }
    if (!handler) {
      if (!env.ABLY_API_KEY || !env.SESSION_SECRET || !env.SETUP_KEY || !env.DB) return new Response("Token service isn't configured yet.", { status: 503 });
      const server = createTokenServer({ apiKey: env.ABLY_API_KEY, sessionSecret: env.SESSION_SECRET, setupKey: env.SETUP_KEY, store: createStore(env.DB) });
      server.listen(8787);
      handler = httpServerHandler({ port: 8787 });
    }
    return handler.fetch(request, env, context);
  }
};
