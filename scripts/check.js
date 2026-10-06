import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const directory of ["extension", "auth", "preview", "scripts"]) {
  for (const filename of await readdir(directory)) {
    if (!filename.endsWith(".js")) continue;
    const result = spawnSync(process.execPath, ["--check", `${directory}/${filename}`], { stdio: "inherit" });
    if (result.status) process.exit(result.status);
  }
}
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
for (const filename of [...manifest.content_scripts.flatMap(entry => entry.js), manifest.background.service_worker, manifest.options_ui.page]) await readFile(`extension/${filename}`);
console.log("JavaScript syntax and JSON checks passed.");
