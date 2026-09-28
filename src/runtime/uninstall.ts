import { WorkbenchInstaller } from "./workbench-installer";

const fs = require("node:fs");
const path = require("node:path");

function findAppRoot(start) {
  let current = start;
  while (current && path.dirname(current) !== current) {
    const candidate = path.join(current, "out", "vs", "workbench", "workbench.desktop.main.js");
    if (fs.existsSync(candidate)) return current;
    current = path.dirname(current);
  }
}

async function main() {
  const appRoot = findAppRoot(process.execPath) || findAppRoot(process.cwd());
  if (!appRoot) return;
  const product = JSON.parse(fs.readFileSync(path.join(appRoot, "product.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
  const installer = new WorkbenchInstaller({
    appRoot,
    version: manifest.version,
    commit: product.commit,
    bridgePath: path.join(__dirname, "workbench-bridge.js")
  });
  await installer.remove();
}

void main().catch(error => {
  console.error(`Editor Columns uninstall cleanup refused an unsafe restore: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
