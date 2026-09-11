<div align="center">
  <img src="https://raw.githubusercontent.com/Kooraseru/vscode-editor-columns/HEAD/assets/goofyaah.png" width="256" alt="VS Code Editor Columns">
  <h1>VS Code Editor Columns</h1>
  <table><tr><td><a href="#overview">Overview</a></td><td><a href="#provider-api">Provider API</a></td><td><a href="#lifecycle">Lifecycle</a></td><td><a href="#license">License</a></td></tr></table>
  <table><tr><td><a href="https://github.com/Kooraseru/vscode-editor-columns/blob/HEAD/docs/ja-JP/README.md">日本語</a></td></tr></table>
</div>

Adds extension-controlled interactive columns to VS Code's native text editor without replacing the editor or modifying document text.

<a id="overview"></a>
## Overview

Columns contain real interactive controls and remain synchronized with scrolling, folding, document edits, line-height changes, and editor resizing. Native context menus, selections, minimap behavior, breakpoints, commands, and editor contributions remain owned by VS Code.

<a id="provider-api"></a>
## Provider API

Consumer extensions declare the dependency, activate it, and register one or more column providers.

```json
{
  "extensionDependencies": ["Kooraseru.vscode-editor-columns"]
}
```

```js
const extension = vscode.extensions.getExtension("Kooraseru.vscode-editor-columns");
const columns = await extension.activate();

context.subscriptions.push(columns.registerColumnProvider({
  id: "example.address",
  label: "Address",
  width: 112,
  provideCell(document, line) {
    return { value: String(line), editable: true };
  },
  onDidChangeCell(document, line, value) {
    console.log(document.uri.toString(), line, value);
  }
}));
```

Cell edits never modify document text automatically. The provider decides whether and where values are persisted.

<a id="lifecycle"></a>
## Extension lifecycle

The local workbench bridge is dormant without a live Editor Columns extension host. Disabling or stopping the extension removes all column DOM and restores native editor geometry. Uninstalling the extension restores the original workbench file after VS Code restarts.

### Compatibility

The current bridge is version-checked for VS Code 1.137.0. VS Code may show an installation-integrity warning while the bridge is installed.

<a id="license"></a>
## License

VS Code Editor Columns is distributed under the ISC License. [LICENSE](LICENSE).
