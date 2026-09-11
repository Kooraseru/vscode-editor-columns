const vscode = require("vscode");

const values = new Map();

function cellKey(document, column, line) {
  return `${document.uri.toString()}\u0000${column}\u0000${line}`;
}

function editableProvider(id, label, defaultValue) {
  return {
    id: `vscode-editor-columns-debug.${id}`,
    label,
    width: 112,
    provideCell(document, line) {
      const key = cellKey(document, id, line);
      return { value: values.get(key) ?? defaultValue(line), editable: true };
    },
    onDidChangeCell(document, line, value) {
      values.set(cellKey(document, id, line), value);
    }
  };
}

async function activate(context) {
  const dependency = vscode.extensions.getExtension("Kooraseru.vscode-editor-columns");
  if (!dependency) throw new Error("VS Code Editor Columns must be installed before its debug consumer.");
  const columns = await dependency.activate();
  context.subscriptions.push(
    columns.registerColumnProvider(editableProvider("address", "ADDRESS", line =>
      `x${(0x3000 + line - 1).toString(16).toUpperCase().padStart(4, "0")}`)),
    columns.registerColumnProvider(editableProvider("encoding", "ENCODING", line =>
      (line - 1).toString(2).padStart(16, "0")))
  );
}

function deactivate() {
  values.clear();
}

module.exports = { activate, deactivate };
