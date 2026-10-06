import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
export function createPreviewServer() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const path = resolve(root, "." + (pathname === "/" ? "/preview/index.html" : pathname));
    if (!path.startsWith(root + sep) || !/^\/(?:extension|preview)\//.test(pathname === "/" ? "/preview/index.html" : pathname)) {
      response.writeHead(404).end(); return;
    }
    try {
      const data = await readFile(path);
      response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PREVIEW_PORT || 4173);
  createPreviewServer().listen(port, "127.0.0.1", () => console.log(`Interaction preview: http://127.0.0.1:${port}`));
}
