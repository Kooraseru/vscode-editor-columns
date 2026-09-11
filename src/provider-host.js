const http = require("node:http");
const vscode = require("vscode");

const FIRST_PORT = 49321;
const LAST_PORT = 49331;

class ProviderHost {
  constructor(token) {
    this.token = token;
    this.providers = new Map();
    this.snapshot = { version: 1, active: true, columns: [] };
    this.server = http.createServer((request, response) => void this.handle(request, response));
  }

  async start() {
    for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
      if (await this.listen(port)) return;
    }
    throw new Error(`No editor-column bridge port is available in ${FIRST_PORT}-${LAST_PORT}.`);
  }

  listen(port) {
    return new Promise(resolve => {
      const onError = () => { this.server.off("listening", onListening); resolve(false); };
      const onListening = () => { this.server.off("error", onError); this.port = port; resolve(true); };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(port, "127.0.0.1");
    });
  }

  register(provider) {
    if (!provider || typeof provider.id !== "string" || typeof provider.provideCell !== "function") {
      throw new TypeError("A column provider requires a string id and provideCell(document, line) function.");
    }
    if (this.providers.has(provider.id)) throw new Error(`Column provider '${provider.id}' is already registered.`);
    this.providers.set(provider.id, provider);
    void this.refresh();
    return new vscode.Disposable(() => { this.providers.delete(provider.id); void this.refresh(); });
  }

  async refresh() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { this.snapshot = { version: 1, active: true, columns: [] }; return; }
    const lines = new Set(editor.visibleRanges.flatMap(range => {
      const result = [];
      for (let line = range.start.line + 1; line <= range.end.line + 1; line += 1) result.push(line);
      return result;
    }));
    const columns = [];
    for (const provider of this.providers.values()) {
      if (provider.selector && vscode.languages.match(provider.selector, editor.document) === 0) continue;
      const cells = {};
      for (const line of lines) {
        const cell = await provider.provideCell(editor.document, line);
        if (cell) cells[line] = { value: String(cell.value ?? ""), editable: cell.editable !== false };
      }
      columns.push({ id: provider.id, label: provider.label ?? provider.id, width: Math.max(48, provider.width ?? 112), cells });
    }
    this.snapshot = { version: 1, active: true, document: editor.document.uri.toString(), columns };
  }

  async handle(request, response) {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "content-type");
    if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.searchParams.get("token") !== this.token) { response.writeHead(403).end(); return; }
    if (request.method === "GET" && url.pathname === "/state") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(this.snapshot));
      return;
    }
    if (request.method === "POST" && url.pathname === "/edit") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const edit = JSON.parse(body);
      const provider = this.providers.get(edit.columnId);
      const editor = vscode.window.activeTextEditor;
      if (provider?.onDidChangeCell && editor) await provider.onDidChangeCell(editor.document, edit.line, edit.value);
      await this.refresh();
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end();
  }

  dispose() {
    this.snapshot = { version: 1, active: false, columns: [] };
    this.server.close();
    this.providers.clear();
  }
}

module.exports = { ProviderHost };
