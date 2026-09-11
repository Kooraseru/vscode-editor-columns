const vscode = require("vscode");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { ProviderHost } = require("./provider-host");

const MARKER = "vscode-editor-columns-workbench-bridge-v1";
const LEGACY_MARKER = "native-editable-column-poc-v1";
const SUPPORTED_VERSION = "1.137.0";
let activeProviderHost;

function workbenchPaths() {
  const workbench = path.join(vscode.env.appRoot, "out", "vs", "workbench", "workbench.desktop.main.js");
  return { workbench, backup: `${workbench}.vscode-editor-columns.backup` };
}

async function isInstalled() {
  const { workbench } = workbenchPaths();
  const source = await fs.readFile(workbench, "utf8");
  return source.includes(MARKER) || source.includes(LEGACY_MARKER);
}

async function installBridge(context, token) {
  if (vscode.version !== SUPPORTED_VERSION) {
    throw new Error(`VS Code Editor Columns 0.1.0 supports VS Code ${SUPPORTED_VERSION}; this installation is ${vscode.version}.`);
  }
  const { workbench, backup } = workbenchPaths();
  const current = await fs.readFile(workbench, "utf8");
  if (current.includes(MARKER) || current.includes(LEGACY_MARKER)) return false;

  try {
    await fs.access(backup);
  } catch {
    await fs.copyFile(workbench, backup);
  }
  const bridgeTemplate = await fs.readFile(context.asAbsolutePath(path.join("src", "workbench-bridge.js")), "utf8");
  const bridge = bridgeTemplate.replace("__VSCODE_EDITOR_COLUMNS_TOKEN__", token);
  await fs.appendFile(workbench, `\n/* ${MARKER} */\n${bridge}`, "utf8");
  await fs.writeFile(context.asAbsolutePath(path.join("src", "install-state.json")), JSON.stringify({ workbench, backup }), "utf8");
  return true;
}

async function removeBridge() {
  const { workbench, backup } = workbenchPaths();
  const legacyBackup = `${workbench}.native-column-poc.backup`;
  try {
    await fs.copyFile(backup, workbench);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.copyFile(legacyBackup, workbench);
  }
}

async function reloadPrompt(message) {
  const choice = await vscode.window.showInformationMessage(message, "Reload Window");
  if (choice === "Reload Window") await vscode.commands.executeCommand("workbench.action.reloadWindow");
}

async function activate(context) {
  let token = context.globalState.get("bridgeToken");
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    await context.globalState.update("bridgeToken", token);
  }
  const providers = new ProviderHost(token);
  await providers.start();
  activeProviderHost = providers;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => void providers.refresh()),
    vscode.window.onDidChangeTextEditorVisibleRanges(() => void providers.refresh()),
    vscode.workspace.onDidChangeTextDocument(() => void providers.refresh()),
    vscode.commands.registerCommand("vscodeEditorColumns.installWorkbenchBridge", async () => {
      try {
        const changed = await installBridge(context, token);
        await reloadPrompt(changed
          ? "The Editor Columns workbench bridge was installed."
          : "The Editor Columns workbench bridge is already installed.");
      } catch (error) {
        void vscode.window.showErrorMessage(`Editor Columns could not install its workbench bridge: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand("vscodeEditorColumns.removeWorkbenchBridge", async () => {
      try {
        await removeBridge();
        await reloadPrompt("The original VS Code workbench was restored.");
      } catch (error) {
        void vscode.window.showErrorMessage(`Editor Columns could not restore the workbench: ${error.message}`);
      }
    })
  );

  void isInstalled().then(installed => {
    if (!installed) {
      void vscode.window.showInformationMessage(
        "VS Code Editor Columns requires a local workbench bridge before it can add native editor columns.",
        "Install Bridge"
      ).then(choice => choice === "Install Bridge"
        ? vscode.commands.executeCommand("vscodeEditorColumns.installWorkbenchBridge")
        : undefined);
    }
  }).catch(() => undefined);

  await providers.refresh();
  return Object.freeze({
    apiVersion: 1,
    isWorkbenchBridgeInstalled: isInstalled,
    registerColumnProvider: provider => providers.register(provider)
  });
}

function deactivate() {
  activeProviderHost?.dispose();
  activeProviderHost = undefined;
}

module.exports = { activate, deactivate };
