import { mkdirSync } from "node:fs";
import { localDatabase } from "./local-database.js";
import { createStore } from "./store.js";
import { createTokenServer } from "./server.js";

mkdirSync(".wrangler", { recursive: true });
const server = createTokenServer({ apiKey: process.env.ABLY_API_KEY, sessionSecret: process.env.SESSION_SECRET, setupKey: process.env.SETUP_KEY, store: createStore(localDatabase(".wrangler/room.sqlite")) });
const port = Number(process.env.AUTH_PORT || process.env.PORT || 8787);
server.listen(port, process.env.AUTH_HOST || "127.0.0.1", () => console.log(`Token service listening on port ${port}`));
