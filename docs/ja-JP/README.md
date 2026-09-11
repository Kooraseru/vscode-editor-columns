<div align="center">
  <img src="https://raw.githubusercontent.com/Kooraseru/vscode-editor-columns/HEAD/assets/goofyaah.png" width="256" alt="VS Code Editor Columns">
  <h1>VS Code Editor Columns</h1>
  <table><tr><td><a href="#overview">概要</a></td><td><a href="#provider-api">プロバイダー API</a></td><td><a href="#lifecycle">ライフサイクル</a></td><td><a href="#license">ライセンス</a></td></tr></table>
  <table><tr><td><a href="https://github.com/Kooraseru/vscode-editor-columns/blob/HEAD/README.md">English</a></td></tr></table>
</div>

VS Code のネイティブテキストエディターを置き換えたり文書テキストを変更したりせず、拡張機能が制御する対話型の列を追加します。

<a id="overview"></a>
## 概要

列には実際の対話型コントロールが含まれ、スクロール、折りたたみ、文書編集、行の高さの変更、エディターのサイズ変更に同期します。コンテキストメニュー、選択、ミニマップ、ブレークポイント、コマンドなどは引き続き VS Code が管理します。

<a id="provider-api"></a>
## プロバイダー API

利用する拡張機能は依存関係を宣言して有効化し、1 つ以上の列プロバイダーを登録します。

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

セルの編集によって文書テキストが自動的に変更されることはありません。値を保存するかどうか、また保存先はプロバイダーが決定します。

<a id="lifecycle"></a>
## 拡張機能のライフサイクル

ローカルワークベンチブリッジは Editor Columns の拡張機能ホストが動作していない場合は休止します。拡張機能を無効化または停止すると列の DOM が削除され、ネイティブエディターの配置が復元されます。アンインストール後に VS Code を再起動すると元のワークベンチファイルが復元されます。

### 互換性

現在のブリッジは VS Code 1.137.0 用にバージョン確認されています。ブリッジのインストール中は VS Code がインストール整合性の警告を表示する場合があります。

<a id="license"></a>
## ライセンス

VS Code Editor Columns は ISC ライセンスで配布されています。 [LICENSE](../../LICENSE).
