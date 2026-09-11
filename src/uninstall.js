const fs = require("node:fs");
const path = require("node:path");

const suffixes = [
  ".vscode-editor-columns.backup",
  ".native-column-poc.backup"
];

function findWorkbench(start) {
  let current = start;
  while (current && path.dirname(current) !== current) {
    const candidate = path.join(current, "out", "vs", "workbench", "workbench.desktop.main.js");
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
}

let recorded;
try { recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "install-state.json"), "utf8")); } catch {}
const workbench = recorded?.workbench || findWorkbench(process.execPath) || findWorkbench(process.cwd());
if (workbench) {
  const backup = (recorded?.backup && fs.existsSync(recorded.backup) ? recorded.backup : undefined)
    || suffixes.map(suffix => `${workbench}${suffix}`).find(candidate => fs.existsSync(candidate));
  if (backup) fs.copyFileSync(backup, workbench);
}
