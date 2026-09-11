/* Renderer bridge. Dormant unless the VS Code Editor Columns extension host is live. */
(() => {
  const TOKEN = "__VSCODE_EDITOR_COLUMNS_TOKEN__";
  const PORTS = Array.from({ length: 11 }, (_, index) => 49321 + index);
  const POLL_MS = 350;
  const HEADER_HEIGHT = 24;
  const attached = new Map();
  let endpoint;

  function detach(editor) {
    const state = attached.get(editor);
    if (!state) return;
    state.column.remove();
    state.sourceHeader.remove();
    state.host.classList.remove("vscode-editor-columns-host");
    state.host.style.removeProperty("--vscode-editor-columns-width");
    attached.delete(editor);
  }

  function renderEditor(editor, snapshot) {
    const host = editor.parentElement;
    if (!host || !snapshot.columns.length) return detach(editor);
    let state = attached.get(editor);
    if (!state) {
      const column = document.createElement("div");
      column.className = "vscode-editor-columns-surface";
      const sourceHeader = document.createElement("div");
      sourceHeader.className = "vscode-editor-columns-source-header";
      sourceHeader.textContent = "SOURCE";
      host.insertBefore(column, editor);
      host.insertBefore(sourceHeader, editor);
      host.classList.add("vscode-editor-columns-host");
      state = { host, column, sourceHeader, headers: new Map() };
      attached.set(editor, state);
    }
    const width = snapshot.columns.reduce((sum, column) => sum + column.width, 0);
    host.style.setProperty("--vscode-editor-columns-width", `${width}px`);
    state.column.style.width = `${width}px`;
    const liveHeaders = new Set();
    snapshot.columns.forEach((definition, columnIndex) => {
      liveHeaders.add(definition.id);
      let header = state.headers.get(definition.id);
      if (!header) {
        header = document.createElement("div");
        header.className = "vscode-editor-columns-column-header";
        state.headers.set(definition.id, header);
        state.column.prepend(header);
      }
      header.textContent = definition.label;
      header.title = definition.label;
      header.style.left = `${snapshot.columns.slice(0, columnIndex).reduce((sum, item) => sum + item.width, 0)}px`;
      header.style.width = `${definition.width}px`;
    });
    for (const [id, header] of state.headers) {
      if (!liveHeaders.has(id)) { header.remove(); state.headers.delete(id); }
    }

    const gutters = [...editor.querySelectorAll(".margin-view-overlays .line-numbers")]
      .filter(node => node.offsetParent !== null);
    const editorRect = editor.getBoundingClientRect();
    const visible = new Set();
    for (const gutter of gutters) {
      const line = Number(gutter.textContent?.trim());
      if (!Number.isInteger(line) || line < 1) continue;
      visible.add(line);
      const rect = gutter.getBoundingClientRect();
      snapshot.columns.forEach((definition, columnIndex) => {
        const key = `${definition.id}:${line}`;
        let input = state.column.querySelector(`[data-cell-key="${CSS.escape(key)}"]`);
        if (!input) {
          input = document.createElement("input");
          input.dataset.cellKey = key;
          input.dataset.columnId = definition.id;
          input.dataset.line = String(line);
          input.addEventListener("keydown", event => event.stopPropagation());
          input.addEventListener("change", () => {
            if (!endpoint) return;
            fetch(`${endpoint}/edit?token=${encodeURIComponent(TOKEN)}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ columnId: definition.id, line, value: input.value })
            }).catch(() => undefined);
          });
          state.column.append(input);
        }
        const cell = definition.cells[String(line)];
        if (document.activeElement !== input) input.value = cell?.value ?? "";
        input.disabled = !cell?.editable;
        input.title = definition.label;
        input.style.left = `${snapshot.columns.slice(0, columnIndex).reduce((sum, item) => sum + item.width, 0) + 4}px`;
        input.style.width = `${definition.width - 8}px`;
        input.style.top = `${HEADER_HEIGHT + rect.top - editorRect.top}px`;
        input.style.height = `${Math.max(16, rect.height - 2)}px`;
      });
    }
    for (const input of [...state.column.querySelectorAll("input")]) {
      if (!visible.has(Number(input.dataset.line)) && document.activeElement !== input) input.remove();
    }
  }

  function render(snapshot) {
    const editors = [...document.querySelectorAll(".editor-instance > .monaco-editor")];
    if (!snapshot?.active || !snapshot.columns?.length) {
      for (const editor of [...attached.keys()]) detach(editor);
      return;
    }
    for (const editor of editors) renderEditor(editor, snapshot);
    for (const editor of [...attached.keys()]) if (!editors.includes(editor)) detach(editor);
  }

  async function poll() {
    const candidates = endpoint ? [Number(new URL(endpoint).port)] : PORTS;
    for (const port of candidates) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/state?token=${encodeURIComponent(TOKEN)}`, { cache: "no-store" });
        if (!response.ok) continue;
        endpoint = `http://127.0.0.1:${port}`;
        render(await response.json());
        return;
      } catch {}
    }
    endpoint = undefined;
    render(null);
  }

  const style = document.createElement("style");
  style.textContent = `
    .vscode-editor-columns-host { position: relative !important; overflow: hidden !important; }
    .vscode-editor-columns-host > .monaco-editor { left: var(--vscode-editor-columns-width) !important; top:${HEADER_HEIGHT}px !important; width:calc(100% - var(--vscode-editor-columns-width)) !important; height:calc(100% - ${HEADER_HEIGHT}px) !important; }
    .vscode-editor-columns-surface { position:absolute; inset:0 auto 0 0; z-index:20; overflow:hidden; box-sizing:border-box; background:var(--vscode-editor-background); border-right:1px solid var(--vscode-panel-border); font-family:var(--monaco-monospace-font); }
    .vscode-editor-columns-column-header,.vscode-editor-columns-source-header { position:absolute; top:0; height:${HEADER_HEIGHT}px; box-sizing:border-box; padding:3px 6px; overflow:hidden; color:var(--vscode-editor-foreground); background:var(--vscode-editor-background); border-bottom:1px solid var(--vscode-panel-border); font-family:var(--monaco-monospace-font); font-size:11px; font-weight:600; line-height:${HEADER_HEIGHT - 1}px; text-overflow:ellipsis; white-space:nowrap; }
    .vscode-editor-columns-column-header { z-index:2; border-right:1px solid var(--vscode-panel-border); }
    .vscode-editor-columns-source-header { z-index:21; left:var(--vscode-editor-columns-width); right:0; }
    .vscode-editor-columns-surface input { position:absolute; box-sizing:border-box; padding:0 5px; color:var(--vscode-input-foreground); background:var(--vscode-input-background); border:1px solid var(--vscode-input-border,transparent); border-radius:2px; font:inherit; outline:none; }
    .vscode-editor-columns-surface input:focus { border-color:var(--vscode-focusBorder); outline:1px solid var(--vscode-focusBorder); }
  `;
  document.head.append(style);
  setInterval(poll, POLL_MS);
  new MutationObserver(() => endpoint && poll()).observe(document.body, { subtree: true, childList: true });
  void poll();
})();
