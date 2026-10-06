import { httpServerHandler } from "cloudflare:node";
import { createTokenServer } from "./server.js";

let handler;
export default {
  fetch(request, env, context) {
    if (!handler) {
      if (!env.ABLY_API_KEY || !env.SESSION_SECRET || !env.SETUP_KEY) return new Response("Token service isn't configured yet.", { status: 503 });
      const server = createTokenServer({ apiKey: env.ABLY_API_KEY, sessionSecret: env.SESSION_SECRET, setupKey: env.SETUP_KEY });
      server.listen(8787);
      handler = httpServerHandler({ port: 8787 });
    }
    return handler.fetch(request, env, context);
  }
};
