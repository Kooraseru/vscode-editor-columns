# VS Code Editor Columns

VS Code Editor Columns adds custom interactive columns and column headers to
VS Code's native text editor.

It augments the editor already used by VS Code. It does not replace the editor
with a webview or create another Monaco instance, and column values remain
separate from document text.

## Download

Download VS Code Editor Columns from its [Visual Studio Marketplace
listing](https://marketplace.visualstudio.com/items?itemName=Kooraseru.vscode-editor-columns),
or install version 0.1.0 from a local terminal:

```bash
code --install-extension Kooraseru.vscode-editor-columns@0.1.0 --force
```

On Windows, run this command from PowerShell or Command Prompt. Running `code`
inside WSL targets the remote Linux VS Code Server instead of the local Windows
desktop installation required by the workbench bridge.

## Current status

Version 0.1.0 packages the native-column proof of concept. It provides
commands to install and remove a local workbench bridge and
renders independently editable cells beside ordinary text editors.

The bridge checks for the workbench editor structure it needs when installed, without requiring an exact VS Code build. The provider API, multiple
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
byte-for-byte backup of `workbench.desktop.main.js` first. If the VS Code installation is protected, choose **Authorize Setup** on Linux to use the system privilege prompt. If that is unavailable, choose **Copy Setup Command** and run the one-time command in an administrator terminal. Reload VS Code afterward. The same flow can remove the bridge.

Run **Editor Columns: Remove Workbench Bridge** to restore that backup. VS Code
may display its installation-integrity warning while the bridge is installed.

## License

ISC, copyright 2026 Kooraseru.

## Local build workspace

Run `node src/scripts/install-dependencies.cjs` to install development dependencies into `.heap/cache/`. The dependency tree stays entirely under `.heap/cache/node_modules/`; no `node_modules` entry is left in `src/`. Run `node src/scripts/run-package.cjs` (or the single VS Code task) to install missing build tools into `.heap/cache/`, then validate, build, and package locally. Run `npm --prefix src run build` to generate the main branch preview at `.heap/preview/repo/main/`; packages go to `.heap/preview/release/`. Intermediate JavaScript lives under `.heap/cache/compiled/`; the repository preview puts the JavaScript and API declaration in `src/`, which the generated extension manifest loads. The `.heap/preview/pages/` directory is reserved for a future Pages preview. All of `.heap/` is disposable and ignored by Git. If a Rust crate is added, set its Cargo target directory to `.heap/cache/cargo-target` so compiled artifacts stay out of source and previews.
