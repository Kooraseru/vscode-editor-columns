# VS Code Editor Columns

![VS Code Editor Columns](assets/goofyaah.png)

VS Code Editor Columns adds custom interactive columns and column headers to
VS Code's native text editor.

It augments the editor already used by VS Code. It does not replace the editor
with a webview or create another Monaco instance, and column values remain
separate from document text.

## Current status

Version 0.1.0 packages the verified native-column proof of concept. It provides
commands to install and remove a version-checked local workbench bridge and
renders independently editable cells beside ordinary text editors.

The initial bridge is pinned to VS Code 1.137.0. The provider API, multiple
provider-defined columns, provider and source headers, and provider edit
callbacks are available as an initial same-extension-host API. Durable
per-editor state remains future work.

## Provider API

Consumer extensions declare `Kooraseru.vscode-editor-columns` in
`extensionDependencies`:

```json
{
  "extensionDependencies": [
    "Kooraseru.vscode-editor-columns"
  ]
}
```

Activate the dependency and register a provider through its exported API:

```js
const columnsExtension = vscode.extensions.getExtension("Kooraseru.vscode-editor-columns");
const columns = await columnsExtension.activate();

context.subscriptions.push(columns.registerColumnProvider({
  id: "example.address",
  label: "Address",
  width: 112,
  selector: { language: "plaintext" },
  provideCell(document, line) {
    return { value: `x${(0x3000 + line - 1).toString(16).toUpperCase()}`, editable: true };
  },
  async onDidChangeCell(document, line, value) {
    console.log(document.uri.toString(), line, value);
  }
}));
```

Cell edits are independent of document text. Providers decide whether and where
to persist them. The complete TypeScript contract is published in
`src/api.d.ts` with the extension.

## Workbench bridge

VS Code's supported extension API cannot reserve native editor space or insert
interactive DOM into the editor. After installation, the extension offers to
install its local workbench bridge and reload the window. It creates a
byte-for-byte backup of `workbench.desktop.main.js` first.

Run **Editor Columns: Remove Workbench Bridge** to restore that backup. VS Code
may display its installation-integrity warning while the bridge is installed.

## License

ISC, copyright 2026 Kooraseru.
