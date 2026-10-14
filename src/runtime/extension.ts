import { WorkbenchInstaller } from "./workbench-installer";

const vscode = require("vscode");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const { ProviderHost } = require("./provider-host");
const { deriveWindowIdFromLogPath } = require("./workbench-compatibility");
let activeProviderHost;
let output;

function log(message) {
  output?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

function logError(message, error) {
  log(`${message}: ${error?.stack ?? error}`);
  output?.show(true);
}

function deriveWindowId(context) {
  return deriveWindowIdFromLogPath(context.logUri.fsPath);
}

async function createInstaller(context) {
  const product = JSON.parse(await fs.readFile(path.join(vscode.env.appRoot, "product.json"), "utf8"));
  return new WorkbenchInstaller({
    appRoot: vscode.env.appRoot,
    version: vscode.version,
    commit: product.commit,
    bridgePath: context.asAbsolutePath(path.join("src", "workbench-bridge.js")),
    log
  });
}

function isPermissionError(error) {
  return error?.code === "EACCES" || error?.code === "EPERM";
}

function quoteSetupPath(value) {
  if (process.platform === "win32") return `'${value.replaceAll("'", "''")}'`;
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function nodeExecutablePath(): string {
  return execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
}

function runWithPolicyKit(helperPath, requestPath): Promise<void> {
  return new Promise((resolve, reject) => {
    let nodePath: string;
    try { nodePath = nodeExecutablePath(); }
    catch (error) { reject(error); return; }
    const child = spawn("pkexec", [nodePath, helperPath, requestPath], { stdio: ["ignore", "pipe", "pipe"] });
    let errorText = "";
    child.stderr.on("data", chunk => { errorText += String(chunk).slice(0, 4096); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(errorText.trim() || `Authorization exited with code ${code}.`)));
  });
}

async function offerElevatedSetup(context, action, token) {
  const requestPath = path.join(context.globalStorageUri.fsPath, `workbench-${action}-request.json`);
  await fs.mkdir(path.dirname(requestPath), { recursive: true });
  await fs.writeFile(requestPath, JSON.stringify({
    schema: 1, action, appRoot: vscode.env.appRoot, token: action === "install" ? token : undefined
  }), { mode: 0o600 });
  await fs.chmod(requestPath, 0o600);
  const helperPath = context.asAbsolutePath(path.join("src", "workbench-admin.js"));
  const command = `${process.platform === "win32" ? "& " : "sudo "}${quoteSetupPath(nodeExecutablePath())} ${quoteSetupPath(helperPath)} ${quoteSetupPath(requestPath)}`;
  const message = process.platform === "win32"
    ? "VS Code is installed in a protected directory. Copy the command, run it in an Administrator PowerShell terminal, then reload VS Code."
    : "VS Code is installed in a protected directory. Authorize the one-time workbench setup, then reload VS Code.";
  const choice = await vscode.window.showErrorMessage(message,
    ...(process.platform === "linux" ? ["Authorize Setup"] : []), "Copy Setup Command");
  if (choice === "Authorize Setup") {
    try {
      await runWithPolicyKit(helperPath, requestPath);
      log(`Administrator ${action} completed.`);
      await reloadPrompt(`The Editor Columns workbench bridge was ${action === "install" ? "installed" : "removed"}.`);
    } catch (error) {
      log(`Administrator ${action} failed: ${error?.message ?? error}`);
      const fallback = await vscode.window.showErrorMessage(
        `Editor Columns could not complete administrator setup: ${error?.message ?? error}`, "Copy Setup Command");
      if (fallback === "Copy Setup Command") await vscode.env.clipboard.writeText(command);
    }
    return;
  }
  if (choice === "Copy Setup Command") {
    await vscode.env.clipboard.writeText(command);
    log(`Copied administrator ${action} command. Request: ${requestPath}`);
  }
}

async function reloadPrompt(message) {
  const choice = await vscode.window.showInformationMessage(message, "Reload Window");
  if (choice === "Reload Window") await vscode.commands.executeCommand("workbench.action.reloadWindow");
}

async function activate(context) {
  output = vscode.window.createOutputChannel("VS Code Editor Columns");
  context.subscriptions.push(output);
  log(`Activating version ${context.extension.packageJSON.version} on VS Code ${vscode.version}.`);

  let token = context.globalState.get("bridgeToken");
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    await context.globalState.update("bridgeToken", token);
    log("Created the workbench bridge authentication token.");
  }
  const windowId = deriveWindowId(context);
  log(`Derived workbench window ${windowId} from the VS Code extension-host log path.`);
  const providers = new ProviderHost(token, windowId, log);
  const installer = await createInstaller(context);
  try {
    await providers.start();
    log("Provider host started.");
  } catch (error) {
    logError("Provider host failed to start", error);
    throw error;
  }
  activeProviderHost = providers;
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => void providers.refresh()),
    vscode.window.onDidChangeTextEditorVisibleRanges(event => void providers.refreshEditor(event.textEditor)),
    vscode.workspace.onDidChangeTextDocument(event => void providers.refreshDocument(event.document)),
    vscode.commands.registerCommand("vscodeEditorColumns.installWorkbenchBridge", async () => {
      try {
        const changed = await installer.install(token);
        log(changed ? "Installed the workbench bridge." : "Workbench bridge was already installed.");
        await reloadPrompt(changed
          ? "The Editor Columns workbench bridge was installed."
          : "The Editor Columns workbench bridge is already installed.");
      } catch (error) {
        if (isPermissionError(error)) {
          log(`Workbench bridge installation needs administrator access: ${error.message}`);
          await offerElevatedSetup(context, "install", token);
        } else {
          logError("Workbench bridge installation failed", error);
          void vscode.window.showErrorMessage(`Editor Columns could not install its workbench bridge: ${error.message}`);
        }
      }
    }),
    vscode.commands.registerCommand("vscodeEditorColumns.removeWorkbenchBridge", async () => {
      try {
        const changed = await installer.remove();
        log(changed ? "Removed the Editor Columns workbench bridge." : "Workbench bridge was not installed.");
        await reloadPrompt(changed ? "The Editor Columns workbench bridge was removed." : "The Editor Columns workbench bridge is not installed.");
      } catch (error) {
        if (isPermissionError(error)) {
          log(`Workbench bridge removal needs administrator access: ${error.message}`);
          await offerElevatedSetup(context, "remove", token);
        } else {
          logError("Workbench bridge removal failed", error);
          void vscode.window.showErrorMessage(`Editor Columns could not restore the workbench: ${error.message}`);
        }
      }
    })
  );

  void installer.status(token).then(status => {
    log(`Workbench bridge file status: ${status}.`);
    if (status === "not-installed" || status === "update-available") {
      const action = status === "update-available" ? "Update Bridge" : "Install Bridge";
      const message = status === "update-available"
        ? "An Editor Columns workbench bridge update is available for this extension version."
        : "VS Code Editor Columns requires a local workbench bridge before it can add native editor columns.";
      void vscode.window.showInformationMessage(message, action).then(choice => choice === action
        ? vscode.commands.executeCommand("vscodeEditorColumns.installWorkbenchBridge")
        : undefined);
    }
  }).catch(error => logError("Could not inspect the workbench bridge", error));

  await providers.refresh();
  log("Initial provider refresh completed; extension API is ready.");
  return Object.freeze({
    apiVersion: 2,
    isWorkbenchBridgeInstalled: async () => (await installer.status(token)).startsWith("installed"),
    registerColumnProvider(provider) {
      log(`Registering column provider ${JSON.stringify(provider.id)} with label ${JSON.stringify(provider.label)}.`);
      const registration = providers.register(provider);
      return {
        dispose() {
          log(`Disposing column provider ${JSON.stringify(provider.id)}.`);
          registration.dispose();
        }
      };
    }
  });
}

function deactivate() {
  log("Deactivating and disposing the provider host.");
  activeProviderHost?.dispose();
  activeProviderHost = undefined;
  output = undefined;
}

module.exports = { activate, deactivate };
