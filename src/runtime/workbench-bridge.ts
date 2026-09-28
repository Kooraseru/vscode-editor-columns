/* Renderer bridge. Dormant unless the VS Code Editor Columns extension host is live. */
(() => {
  const TOKEN = "__VSCODE_EDITOR_COLUMNS_TOKEN__", PROTOCOL_VERSION = 1;
  const FIRST_PORT = 49321, PORT_COUNT = 64, CANDIDATE_COUNT = 4, PORT_STRIDE = 17, HEADER_HEIGHT = 24;
  const GENERATED_CSS = "__VSCODE_EDITOR_COLUMNS_GENERATED_CSS__";

  class WorkbenchCompatibility {
    editorSelector = ".editor-instance > .monaco-editor";
    discoverEditors() {
      return ([...document.querySelectorAll(this.editorSelector)] as HTMLElement[]).filter(editor =>
        editor.offsetParent !== null && editor.getClientRects().length > 0);
    }
    matchEditor(snapshots: any[], viewIndex: number) { return snapshots.find(item => item.viewIndex === viewIndex); }
    hostFor(editor: HTMLElement) { return editor.parentElement; }
    visibleModelLines(editor: HTMLElement, visibleLines: number[]) {
      const editorRect = editor.getBoundingClientRect();
      const result = new Map<number, { top: number; height: number }>();
      const gutter = [...editor.querySelectorAll(".margin-view-overlays .line-numbers")]
        .filter((node: Element) => (node as HTMLElement).offsetParent !== null) as HTMLElement[];
      const absoluteNumbers = gutter.map(node => Number(node.textContent?.trim()));
      // Monaco renders a few lines beyond VS Code's visible range. Requiring
      // every gutter number to be inside that range drops the entire mapping.
      const usesAbsoluteNumbers = gutter.length > 0 &&
        absoluteNumbers.every((line, index) => Number.isSafeInteger(line) && line > 0 &&
          (index === 0 || line > absoluteNumbers[index - 1]));
      const nodes = gutter.length === visibleLines.length || usesAbsoluteNumbers
        ? gutter
        : [...editor.querySelectorAll(".view-lines > .view-line")]
            .filter((node: Element) => (node as HTMLElement).offsetParent !== null) as HTMLElement[];
      if (!usesAbsoluteNumbers && nodes.length !== visibleLines.length) return result;
      nodes.forEach((node, index) => {
        const line = usesAbsoluteNumbers ? absoluteNumbers[index] - 1 : visibleLines[index];
        if (!Number.isSafeInteger(line) || line < 0 || !usesAbsoluteNumbers && !visibleLines.includes(line) || result.has(line)) return;
        const rect = node.getBoundingClientRect();
        result.set(line, { top: HEADER_HEIGHT + rect.top - editorRect.top, height: Math.max(16, rect.height - 2) });
      });
      return result;
    }
  }

  type EditorState = { host: HTMLElement; column: HTMLElement; sourceHeader: HTMLElement;
    headers: Map<string, HTMLElement>; cells: Map<string, HTMLInputElement>; sashes: Map<string, HTMLElement>;
    layout: Map<string, { left: number; width: number }>;
    visibleModelLines: Map<number, { top: number; height: number }>;
    lastAppliedRevision: number; snapshot: any };
  const compatibility = new WorkbenchCompatibility();
  const attached = new Map<HTMLElement, EditorState>();
  const columnWidths = new Map<string, number>();
  const pendingEdits = new Map<string, { input: HTMLInputElement; previousValue: string }>();
  const windowId = Number((window as any).vscodeWindowId);
  let socket: WebSocket | undefined, latestSnapshot: any, reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function candidatePorts() {
    let hash = 2166136261;
    for (const character of `${TOKEN}:${windowId}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    const start = (hash >>> 0) % PORT_COUNT;
    return Array.from({ length: CANDIDATE_COUNT }, (_, index) => FIRST_PORT + ((start + index * PORT_STRIDE) % PORT_COUNT));
  }
  function protocol() { return `vscode-editor-columns-v${PROTOCOL_VERSION}.${windowId}.${TOKEN}`; }

  function detach(editor: HTMLElement) {
    const state = attached.get(editor); if (!state) return;
    state.column.remove(); state.sourceHeader.remove();
    state.host.classList.remove("vscode-editor-columns-host");
    state.host.style.removeProperty("--vscode-editor-columns-width"); attached.delete(editor);
  }
  function attach(editor: HTMLElement) {
    const host = compatibility.hostFor(editor); if (!host) return;
    const column = document.createElement("div"); column.className = "vscode-editor-columns-surface";
    const sourceHeader = document.createElement("div"); sourceHeader.className = "vscode-editor-columns-source-header";
    sourceHeader.textContent = "SOURCE"; host.insertBefore(column, editor); host.insertBefore(sourceHeader, editor);
    host.classList.add("vscode-editor-columns-host");
    const state: EditorState = { host, column, sourceHeader, headers: new Map(), cells: new Map(), sashes: new Map(), layout: new Map(),
      visibleModelLines: new Map(), lastAppliedRevision: 0, snapshot: undefined };
    attached.set(editor, state); return state;
  }
  function syncEditorTypography(editor: HTMLElement, state: EditorState) {
    const text = editor.querySelector(".view-lines .view-line") ?? editor.querySelector(".view-lines") ?? editor;
    const typography = getComputedStyle(text);
    for (const target of [state.column, state.sourceHeader]) {
      target.style.fontFamily = typography.fontFamily;
      target.style.fontSize = typography.fontSize;
      target.style.fontWeight = typography.fontWeight;
      target.style.letterSpacing = typography.letterSpacing;
    }
    state.column.style.lineHeight = typography.lineHeight;
    const gutter = editor.querySelector(".overflow-guard > .margin") as HTMLElement | null;
    const minimap = editor.querySelector(".minimap") as HTMLElement | null;
    editor.style.setProperty("--vscode-editor-columns-gutter-width", `${gutter?.getBoundingClientRect().width ?? 0}px`);
    editor.style.setProperty("--vscode-editor-columns-minimap-width", `${minimap?.getBoundingClientRect().width ?? 0}px`);
  }
  function updateDefinitions(state: EditorState, snapshot: any) {
    state.layout.clear(); let offset = 0; const live = new Set<string>();
    for (const definition of snapshot.columns) {
      const width = columnWidths.get(definition.id) ?? definition.width;
      const layout = { left: offset, width }; state.layout.set(definition.id, layout); offset += width;
      live.add(definition.id); let header = state.headers.get(definition.id);
      if (!header) { header = document.createElement("div"); header.className = "vscode-editor-columns-column-header";
        state.headers.set(definition.id, header); state.column.append(header); }
      header.textContent = definition.label; header.title = definition.label;
      header.style.left = `${layout.left}px`; header.style.width = `${layout.width}px`;
      let sash = state.sashes.get(definition.id);
      if (!sash) {
        sash = document.createElement("div"); sash.className = "vscode-editor-columns-sash";
        sash.setAttribute("role", "separator"); sash.setAttribute("aria-orientation", "vertical");
        sash.title = `Resize ${definition.label} column`;
        state.sashes.set(definition.id, sash); state.column.append(sash);
        const id = definition.id;
        sash.addEventListener("pointerdown", event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          const startX = event.clientX, startWidth = state.layout.get(id)?.width ?? width;
          sash!.setPointerCapture(event.pointerId);
          const move = (moveEvent: PointerEvent) => {
            columnWidths.set(id, Math.max(48, Math.min(800, startWidth + moveEvent.clientX - startX)));
            updateDefinitions(state, state.snapshot);
            renderEditor([...attached].find(([, candidate]) => candidate === state)![0], state.snapshot, true);
          };
          const end = (upEvent: PointerEvent) => {
            sash!.releasePointerCapture(upEvent.pointerId);
            sash!.removeEventListener("pointermove", move);
            sash!.removeEventListener("pointerup", end);
            sash!.removeEventListener("pointercancel", end);
          };
          sash!.addEventListener("pointermove", move);
          sash!.addEventListener("pointerup", end);
          sash!.addEventListener("pointercancel", end);
        });
      }
      sash.style.left = `${offset - 3}px`;
    }
    for (const [id, header] of state.headers) if (!live.has(id)) { header.remove(); state.headers.delete(id); }
    for (const [id, sash] of state.sashes) if (!live.has(id)) { sash.remove(); state.sashes.delete(id); }
    for (const [key, input] of state.cells) if (!live.has(input.dataset.columnId ?? "")) { input.remove(); state.cells.delete(key); }
    state.host.style.setProperty("--vscode-editor-columns-width", `${offset}px`); state.column.style.width = `${offset}px`;
  }
  function createCell(state: EditorState, definition: any, line: number) {
    const key = `${definition.id}:${line}`, input = document.createElement("input");
    input.dataset.cellKey = key; input.dataset.columnId = definition.id; input.dataset.line = String(line);
    input.addEventListener("keydown", event => event.stopPropagation());
    input.addEventListener("change", () => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (!input.checkValidity()) { input.reportValidity(); return; }
      const current = state.snapshot;
      const requestId = crypto.randomUUID(); pendingEdits.set(requestId, { input, previousValue: input.dataset.committedValue ?? "" }); input.disabled = true;
      socket.send(JSON.stringify({ protocol: PROTOCOL_VERSION, type: "edit", requestId, windowId,
        documentId: current.documentId, editorId: current.editorId, revision: current.revision,
        columnId: definition.id, line, value: input.value }));
    });
    state.cells.set(key, input); state.column.append(input); return input;
  }
  function renderEditor(editor: HTMLElement, snapshot: any, layoutOnly: boolean) {
    if (!snapshot?.columns?.length) return detach(editor);
    const state = attached.get(editor) ?? attach(editor); if (!state) return;
    syncEditorTypography(editor, state);
    if (!layoutOnly && snapshot.revision < state.lastAppliedRevision) return;
    if ((!layoutOnly || !state.snapshot) && snapshot.revision !== state.lastAppliedRevision) {
      if (state.snapshot && (state.snapshot.documentId !== snapshot.documentId ||
          state.snapshot.documentVersion !== snapshot.documentVersion)) {
        for (const input of state.cells.values()) input.remove();
        state.cells.clear();
      }
      if (state.snapshot && state.snapshot.documentId === snapshot.documentId &&
          state.snapshot.documentVersion === snapshot.documentVersion) {
        const previous = new Map(state.snapshot.columns.map((column: any) => [column.id, column]));
        snapshot = { ...snapshot, columns: snapshot.columns.map((column: any) => {
          const old: any = previous.get(column.id);
          return old?.epoch === column.epoch ? { ...column, cells: { ...old.cells, ...column.cells } } : column;
        }) };
      }
      state.snapshot = snapshot; state.lastAppliedRevision = snapshot.revision; updateDefinitions(state, snapshot);
    }
    snapshot = state.snapshot; state.visibleModelLines = compatibility.visibleModelLines(editor, snapshot.visibleLines); const live = new Set<string>();
    for (const definition of snapshot.columns) {
      const layout = state.layout.get(definition.id)!;
      for (const [line, position] of state.visibleModelLines) {
        const key = `${definition.id}:${line}`, cell = definition.cells[String(line)];
        if (!cell) continue;
        live.add(key);
        const input = state.cells.get(key) ?? createCell(state, definition, line);
        input.hidden = false;
        if (document.activeElement !== input && input.value !== cell.value) input.value = cell.value;
        input.dataset.committedValue = cell?.value ?? "";
        input.disabled = !cell?.editable; input.pattern = cell.pattern ?? "";
        input.title = `${definition.label}: ${cell.value}${cell.pattern ? " (x-prefixed hex only)" : ""}`;
        input.style.left = `${layout.left + 4}px`; input.style.width = `${layout.width - 8}px`;
        input.style.top = `${position.top}px`; input.style.height = `${position.height}px`;
      }
    }
    for (const [key, input] of state.cells) if (!live.has(key) && document.activeElement !== input) input.hidden = true;
  }
  function render(snapshot?: any, layoutOnly = false) {
    if (snapshot !== undefined) latestSnapshot = snapshot;
    const editors = compatibility.discoverEditors(), snapshots = latestSnapshot?.editors ?? [];
    if (!latestSnapshot?.active) { for (const editor of [...attached.keys()]) detach(editor); return; }
    editors.forEach((editor, index) => renderEditor(editor, compatibility.matchEditor(snapshots, index), layoutOnly));
    for (const editor of [...attached.keys()]) if (!editors.includes(editor)) detach(editor);
  }
  function handleMessage(event: MessageEvent) {
    if (typeof event.data !== "string" || event.data.length > 64 * 1024) return socket?.close(1008, "invalid-message");
    let message: any; try { message = JSON.parse(event.data); } catch { return socket?.close(1008, "invalid-json"); }
    if (message?.protocol !== PROTOCOL_VERSION || message.windowId !== undefined && message.windowId !== windowId) return socket?.close(1008, "unsupported-protocol");
    if (message.type === "state") render(message.snapshot);
    if (message.type === "edit-result" || message.type === "error") {
      const pending = pendingEdits.get(message.requestId); if (!pending) return; pendingEdits.delete(message.requestId);
      if (message.type === "error" || message.ok !== true) pending.input.value = pending.previousValue; pending.input.disabled = false;
    }
  }
  function scheduleReconnect() {
    if (reconnectTimer !== undefined) return;
    const delay = Math.min(30_000, 250 * 2 ** Math.min(reconnectAttempt++, 7));
    reconnectTimer = setTimeout(() => { reconnectTimer = undefined; connectCandidate(0); }, delay);
  }
  function connectCandidate(index: number) {
    if (!Number.isSafeInteger(windowId) || windowId < 1) return; const ports = candidatePorts();
    if (index >= ports.length) return scheduleReconnect();
    const candidate = new WebSocket(`ws://127.0.0.1:${ports[index]}`, protocol()); let opened = false;
    candidate.addEventListener("open", () => { opened = true; socket = candidate; reconnectAttempt = 0; });
    candidate.addEventListener("message", handleMessage); candidate.addEventListener("error", () => undefined);
    candidate.addEventListener("close", () => { if (socket === candidate) socket = undefined;
      if (opened) { render(null); scheduleReconnect(); } else connectCandidate(index + 1); });
  }
  function initializeDom() {
    if (!document.head || !document.body) { setTimeout(initializeDom, 50); return; }
    const style = document.createElement("style"); style.textContent = GENERATED_CSS; document.head.append(style);
    new MutationObserver(() => render(undefined, true)).observe(document.body, { subtree: true, childList: true });
  }
  const testHooks = (window as any).__vscodeEditorColumnsTestHooks;
  if (testHooks) Object.assign(testHooks, { compatibility, render, attached });
  connectCandidate(0); initializeDom();
})();
