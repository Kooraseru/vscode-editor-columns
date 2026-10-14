function deriveWindowIdFromLogPath(logPath: string): number {
  const normalized = logPath.replaceAll("\\", "/");
  const match = /\/window(\d+)\/exthost(?:\/|$)/.exec(normalized);
  if (!match) throw new Error(`Cannot identify the VS Code window from the extension-host log path: ${logPath}`);
  const windowId = Number(match[1]);
  if (!Number.isSafeInteger(windowId) || windowId < 1) throw new Error("VS Code window identity is invalid.");
  return windowId;
}

function validateWorkbenchSource(source: string): void {
  if (source.length < 1024 || !source.includes("monaco-editor")) {
    throw new Error("The VS Code workbench file does not contain the editor structure required by the bridge.");
  }
}

module.exports = { deriveWindowIdFromLogPath, validateWorkbenchSource };
