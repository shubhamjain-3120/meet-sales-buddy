import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
await build({
  entryPoints: ["extension/realtime.js"],
  outfile: "extension/realtime.bundle.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  minify: true,
  legalComments: "eof"
});
await copyFile("node_modules/ably/LICENSE", "extension/ABLY-LICENSE.txt");
await copyFile("LICENSE", "extension/LICENSE.txt");
console.log("Extension built. Load the extension/ folder in Chrome.");
