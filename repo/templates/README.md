<div align="center">
  <img src="{{ link:icon }}" width="256" alt="VS Code Editor Columns">
  <h1>{{ l10n:repository.title }}</h1>
  <table><tr><td><a href="#overview">{{ l10n:repository.navigation.overview }}</a></td><td><a href="#provider-api">{{ l10n:repository.navigation.api }}</a></td><td><a href="#lifecycle">{{ l10n:repository.navigation.lifecycle }}</a></td><td><a href="#license">{{ l10n:repository.navigation.license }}</a></td></tr></table>
  {{ locales:repository }}
</div>

{{ l10n:repository.summary }}

<a id="overview"></a>
## {{ l10n:repository.overview }}

{{ l10n:repository.overview_text }}

<a id="provider-api"></a>
## {{ l10n:repository.api }}

{{ l10n:repository.api_intro }}

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

{{ l10n:repository.api_note }}

<a id="lifecycle"></a>
## {{ l10n:repository.lifecycle }}

{{ l10n:repository.lifecycle_text }}

### {{ l10n:repository.compatibility }}

{{ l10n:repository.compatibility_text }}

<a id="license"></a>
## {{ l10n:repository.license_heading }}

{{ l10n:repository.license_text }} [LICENSE]({{ link:license }}).
