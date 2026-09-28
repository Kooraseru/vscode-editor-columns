import { WorkbenchInstaller } from "./workbench-installer";

const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const requestPath = process.argv[2];
  if (!requestPath || process.argv.length !== 3) throw new Error("Usage: node workbench-admin.js <request.json>");
  const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
  if (request.schema !== 1 || !["install", "remove"].includes(request.action) ||
      typeof request.appRoot !== "string" || !path.isAbsolute(request.appRoot) ||
      (request.action === "install" && (typeof request.token !== "string" || request.token.length < 32))) {
    throw new Error("Invalid Editor Columns workbench request.");
  }
  const product = JSON.parse(await fs.readFile(path.join(request.appRoot, "product.json"), "utf8"));
  if (typeof product.version !== "string" || typeof product.commit !== "string") {
    throw new Error("The requested path is not a recognized VS Code installation.");
  }
  const installer = new WorkbenchInstaller({
    appRoot: request.appRoot,
    version: product.version,
    commit: product.commit,
    bridgePath: path.join(__dirname, "workbench-bridge.js")
  });
  const changed = request.action === "install"
    ? await installer.install(request.token)
    : await installer.remove();
  await fs.unlink(requestPath);
  console.log(changed
    ? `Editor Columns workbench bridge ${request.action === "install" ? "installed" : "removed"}. Reload VS Code to apply the change.`
    : `Editor Columns workbench bridge was already ${request.action === "install" ? "installed" : "removed"}.`);
}

void main().catch(error => {
  console.error(`Editor Columns workbench operation failed: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
