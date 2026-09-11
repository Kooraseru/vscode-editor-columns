import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { access } from "node:fs/promises";

for (const file of ["extension.js", "provider-host.js", "uninstall.js", "workbench-bridge.js", "debug-extension/extension.js", "scripts/build.mjs", "scripts/package.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const manifest = JSON.parse(await readFile("package.json", "utf8"));
if (manifest.main !== "./src/extension.js") throw new Error("The generated extension entry point must be src/extension.js.");
if (manifest.name !== "vscode-editor-columns" || manifest.publisher !== "Kooraseru") {
  throw new Error("The extension identity does not match the package contract.");
}
if (manifest.license !== "ISC") throw new Error("The package must use the repository's ISC license.");
if (manifest.icon !== "assets/goofyaah.png") throw new Error("The extension icon must reference the authored asset.");
await access("../assets/goofyaah.png");

const debugManifest = JSON.parse(await readFile("debug-extension/package.json", "utf8"));
if (!debugManifest.extensionDependencies?.includes("Kooraseru.vscode-editor-columns")) {
  throw new Error("The debug extension must consume the published Editor Columns API.");
}

const bridge = await readFile("workbench-bridge.js", "utf8");
if (!bridge.includes('sourceHeader.textContent = "SOURCE"') || !bridge.includes("definition.label")) {
  throw new Error("The bridge must render both the native SOURCE header and provider labels.");
}

const readmeTemplate = await readFile("../repo/templates/README.md", "utf8");
if (!readmeTemplate.includes('<div align="center">') ||
    !readmeTemplate.includes('<img src="{{ link:icon }}"') ||
    !readmeTemplate.includes("{{ locales:repository }}")) {
  throw new Error("The README must center its icon, navigation, and locale table.");
}
const vscodeIgnore = await readFile(".vscodeignore", "utf8");
if (/^docs\/\*\*/m.test(vscodeIgnore)) {
  throw new Error("Localized documentation must not be excluded from the VSIX.");
}

const releaseFiles = (await readdir("../releases/records")).filter(file => file.endsWith(".md"));
if (releaseFiles.length !== 1 || releaseFiles[0] !== "2026.09.1-regular.md") {
  throw new Error("The pre-v1 repository must contain only the 2026.09.1-regular release record.");
}
const release = await readFile(`../releases/records/${releaseFiles[0]}`, "utf8");
if (!release.startsWith("# 2026.09.1-regular\n")) throw new Error("The release heading must match its canonical ID.");
console.log("Source and package contract checks passed.");
