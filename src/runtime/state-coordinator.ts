const vscode = require("vscode");

type EditorRecord = {
  editor: any;
  editorId: string;
  documentId: string;
  viewIndex: number;
  revision: number;
  cancellation?: any;
  snapshot?: any;
  cache: Map<string, { provider: any; version: any; epoch: number; fullyCovered: boolean; covered: Set<number>; cells: Record<string, any> }>;
};

class StateCoordinator {
  registry: any;
  publish: (snapshot: any) => void;
  log: (message: string) => void;
  records: Map<any, EditorRecord>;
  nextEditorId: number;
  nextRevision: number;
  disposed: boolean;

  constructor(registry: any, publish: (snapshot: any) => void, log: (message: string) => void = () => undefined) {
    this.registry = registry;
    this.publish = publish;
    this.log = log;
    this.records = new Map();
    this.nextEditorId = 1;
    this.nextRevision = 1;
    this.disposed = false;
  }

  syncVisibleEditors(editors: any[] = vscode.window.visibleTextEditors) {
    if (this.disposed) return Promise.resolve();
    const visible = new Set(editors);
    for (const [editor, record] of this.records) {
      if (!visible.has(editor)) {
        record.cancellation?.cancel();
        record.cancellation?.dispose();
        this.records.delete(editor);
      }
    }
    editors.forEach((editor, viewIndex) => {
      let record = this.records.get(editor);
      if (!record) {
        record = {
          editor,
          editorId: `editor-${this.nextEditorId++}`,
          documentId: editor.document.uri.toString(),
          viewIndex,
          revision: 0,
          cache: new Map()
        };
        this.records.set(editor, record);
      }
      if (record.documentId !== editor.document.uri.toString()) {
        record.documentId = editor.document.uri.toString();
        record.cache.clear();
        record.snapshot = undefined;
      }
      record.viewIndex = viewIndex;
    });
    this.publishCurrent();
    return Promise.all(editors.map(editor => this.refreshEditor(editor))).then(() => undefined);
  }

  refreshDocument(document: any) {
    const work = [...this.records.values()]
      .filter(record => record.editor.document === document)
      .map(record => { record.cache.clear(); return this.refreshEditor(record.editor); });
    return Promise.all(work).then(() => undefined);
  }

  async refreshEditor(editor: any) {
    const record = this.records.get(editor);
    if (!record || this.disposed) return;
    record.cancellation?.cancel();
    record.cancellation?.dispose();
    const cancellation = new vscode.CancellationTokenSource();
    record.cancellation = cancellation;
    const revision = this.nextRevision++;
    record.revision = revision;
    const visibleLines = this.visibleLines(editor);
    const ranges = this.visibleRanges(visibleLines);
    const columns: any[] = [];
    const matchedProviders = this.registry.matching(editor.document);
    if (!record.snapshot || record.snapshot.documentId !== record.documentId ||
        record.snapshot.documentVersion !== editor.document.version) {
      record.snapshot = {
        documentId: record.documentId, documentVersion: editor.document.version,
        editorId: record.editorId, viewIndex: record.viewIndex, revision, visibleLines,
        columns: matchedProviders.map(provider => ({ id: provider.id, label: provider.label ?? provider.id,
          width: Math.max(48, provider.width ?? 112), cells: {} }))
      };
      this.publishCurrent();
    }
    for (const provider of matchedProviders) {
      if (cancellation.token.isCancellationRequested || record.revision !== revision) return;
      let cache = record.cache.get(provider.id);
      if (!cache || cache.provider !== provider || cache.version !== editor.document.version) {
        cache = { provider, version: editor.document.version, epoch: this.nextRevision++, fullyCovered: false,
          covered: new Set<number>(), cells: {} };
        record.cache.set(provider.id, cache);
      }
      const cells: Record<string, any> = {};
      try {
        const prefetchAll = provider.prefetch === "document" && Number.isSafeInteger(editor.document.lineCount) &&
          editor.document.lineCount <= 10_000;
        const requestedRanges = prefetchAll ? cache.fullyCovered ? [] : [{ start: 0, end: editor.document.lineCount }] : ranges;
        for (const range of requestedRanges) {
          if (cancellation.token.isCancellationRequested || record.revision !== revision) return;
          const missingLines = prefetchAll
            ? Array.from({ length: range.end - range.start }, (_, index) => range.start + index).filter(line => !cache.covered.has(line))
            : visibleLines.filter(line => line >= range.start && line < range.end && !cache.covered.has(line));
          for (const missing of this.visibleRanges(missingLines)) {
            const batch = await provider.provideCells(editor.document, missing, cancellation.token);
            if (cancellation.token.isCancellationRequested || record.revision !== revision) return;
            this.validateBatch(provider.id, missing, batch);
            for (const cell of batch.cells) cache.cells[String(cell.line)] = {
              value: cell.value, editable: cell.editable === true, pattern: cell.pattern
            };
            for (let line = missing.start; line < missing.end; line += 1) cache.covered.add(line);
          }
        }
        if (prefetchAll) cache.fullyCovered = true;
      } catch (error) {
        if (cancellation.token.isCancellationRequested || record.revision !== revision) return;
        this.log(`Column provider ${JSON.stringify(provider.id)} failed: ${error?.stack ?? error}`);
        continue;
      }
      for (const line of visibleLines) if (cache.cells[String(line)]) cells[String(line)] = cache.cells[String(line)];
      columns.push({
        id: provider.id,
        label: provider.label ?? provider.id,
        width: Math.max(48, provider.width ?? 112),
        epoch: cache.epoch,
        cells
      });
    }
    if (cancellation.token.isCancellationRequested || record.revision !== revision || !this.records.has(editor)) return;
    record.snapshot = {
      documentId: record.documentId,
      editorId: record.editorId,
      viewIndex: record.viewIndex,
      revision,
      documentVersion: editor.document.version,
      visibleLines,
      columns
    };
    cancellation.dispose();
    record.cancellation = undefined;
    this.publishCurrent();
  }

  visibleLines(editor: any) {
    const lines = new Set<number>();
    for (const range of editor.visibleRanges) {
      for (let line = range.start.line; line <= range.end.line; line += 1) lines.add(line);
    }
    return [...lines].sort((left, right) => left - right);
  }

  visibleRanges(lines: number[]) {
    const ranges: Array<{ start: number; end: number }> = [];
    for (const line of lines) {
      const current = ranges.at(-1);
      if (current && current.end === line) current.end = line + 1;
      else ranges.push({ start: line, end: line + 1 });
    }
    return ranges;
  }

  validateBatch(providerId: string, range: any, batch: any) {
    if (!batch || !Array.isArray(batch.cells)) throw new TypeError(`Column provider '${providerId}' returned an invalid cell batch.`);
    const seen = new Set<number>();
    for (const cell of batch.cells) {
      if (!cell || !Number.isSafeInteger(cell.line) || cell.line < range.start || cell.line >= range.end || seen.has(cell.line) ||
          typeof cell.value !== "string" || cell.editable !== undefined && typeof cell.editable !== "boolean" ||
          cell.pattern !== undefined && (typeof cell.pattern !== "string" || cell.pattern.length > 256)) {
        throw new TypeError(`Column provider '${providerId}' returned an invalid cell.`);
      }
      seen.add(cell.line);
    }
  }

  invalidate(provider: any, change: any = {}) {
    if (change !== undefined && (typeof change !== "object" || change === null)) {
      this.log(`Ignored invalidation from ${JSON.stringify(provider.id)} because its shape is invalid.`);
      return Promise.resolve();
    }
    const work = [...this.records.values()].filter(record => {
      if (!this.registry.matching(record.editor.document).includes(provider)) return false;
      if (change.document && change.document.toString() !== record.documentId) return false;
      if (change.range) {
        if (!Number.isSafeInteger(change.range.start) || !Number.isSafeInteger(change.range.end) ||
            change.range.start < 0 || change.range.end <= change.range.start) return false;
        if (!this.visibleLines(record.editor).some(line => line >= change.range.start && line < change.range.end)) return false;
      }
      return true;
    }).map(record => { record.cache.delete(provider.id); return this.refreshEditor(record.editor); });
    return Promise.all(work).then(() => undefined);
  }

  publishCurrent() {
    if (this.disposed) return;
    const editors = [...this.records.values()]
      .filter(record => record.snapshot)
      .sort((left, right) => left.viewIndex - right.viewIndex)
      .map(record => ({ ...record.snapshot, viewIndex: record.viewIndex }));
    this.publish({ version: 1, active: true, editors });
  }

  async applyEdit(edit: any) {
    const record = [...this.records.values()].find(candidate => candidate.editorId === edit.editorId);
    if (!record || record.documentId !== edit.documentId || record.revision !== edit.revision ||
        record.snapshot?.revision !== edit.revision) throw new Error("stale-edit");
    const provider = this.registry.get(edit.columnId);
    const column = record.snapshot.columns.find(column => column.id === edit.columnId);
    if (!provider?.applyEdit || !column || column.cells[String(edit.line)]?.editable !== true) {
      throw new Error("edit-rejected");
    }
    if (!Number.isSafeInteger(edit.line) || edit.line < 0 || typeof edit.value !== "string") throw new Error("edit-rejected");
    const cancellation = new vscode.CancellationTokenSource();
    try {
      await provider.applyEdit(record.editor.document, { line: edit.line, value: edit.value }, cancellation.token);
    } catch (error) {
      this.log(`Column provider ${JSON.stringify(provider.id)} rejected an edit: ${error?.stack ?? error}`);
      throw new Error("edit-rejected");
    } finally {
      cancellation.dispose();
    }
    if (record.revision === edit.revision) { record.cache.delete(provider.id); await this.refreshEditor(record.editor); }
  }

  dispose() {
    this.disposed = true;
    for (const record of this.records.values()) {
      record.cancellation?.cancel();
      record.cancellation?.dispose();
    }
    this.records.clear();
  }
}

module.exports = { StateCoordinator };
