import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("renderer owns per-editor maps and maps model lines independently of displayed gutter text", async () => {
  const source = await readFile("runtime/workbench-bridge.ts", "utf8");
  assert.match(source, /class WorkbenchCompatibility/);
  assert.match(source, /visibleModelLines\(editor, snapshot\.visibleLines\)/);
  assert.match(source, /getComputedStyle\(text\)/);
  for (const field of ["headers", "cells", "layout", "visibleModelLines", "lastAppliedRevision"]) assert.match(source, new RegExp(field));
  assert.match(source, /snapshot\.revision < state\.lastAppliedRevision/);
  assert.match(source, /documentId: current\.documentId, editorId: current\.editorId, revision: current\.revision/);
});

test("visible rows map to model lines with relative or hidden line numbers", async () => {
  const source = await readFile("../.heap/cache/compiled/main/workbench-bridge.js", "utf8");
  const hooks = {};
  const row = (top, label = "7") => ({ textContent: label, offsetParent: {},
    getBoundingClientRect: () => ({ top, height: 20 }) });
  let gutter = [row(10), row(30)], viewLines = [];
  const editor = { parentElement: {}, getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll: selector => selector.includes("margin-view-overlays") ? gutter : viewLines };
  const document = { head: { append() {} }, body: {}, activeElement: undefined,
    createElement: () => ({ style: {}, append() {} }), querySelectorAll: () => [] };
  class FakeWebSocket { static OPEN = 1; addEventListener() {} }
  vm.runInNewContext(source, { window: { vscodeWindowId: 1, __vscodeEditorColumnsTestHooks: hooks }, document,
    WebSocket: FakeWebSocket, MutationObserver: class { observe() {} }, setTimeout() {}, crypto: {}, console });
  const visibleEditor = { offsetParent: {}, getClientRects: () => [1] };
  const hiddenEditor = { offsetParent: null, getClientRects: () => [] };
  document.querySelectorAll = () => [hiddenEditor, visibleEditor];
  assert.deepEqual([...hooks.compatibility.discoverEditors()], [visibleEditor]);
  document.querySelectorAll = () => [];
  assert.deepEqual([...hooks.compatibility.visibleModelLines(editor, [40, 41]).keys()], [40, 41]);
  gutter = []; viewLines = [row(10), row(30)];
  assert.deepEqual([...hooks.compatibility.visibleModelLines(editor, [8, 9]).keys()], [8, 9]);
  gutter = [row(10, "9"), row(30, "11")]; viewLines = [];
  assert.deepEqual([...hooks.compatibility.visibleModelLines(editor, [8, 9, 10]).keys()], [8, 10]);
  gutter = [row(-10, "260"), row(10, "261"), row(30, "262"), row(50, "263")];
  assert.deepEqual([...hooks.compatibility.visibleModelLines(editor, [260, 261]).keys()], [260, 261]);
});

test("DOM observation performs local layout only and never requests state", async () => {
  const source = await readFile("runtime/workbench-bridge.ts", "utf8");
  assert.match(source, /MutationObserver\(\(\) => render\(undefined, true\)\)/);
  assert.doesNotMatch(source, /fetch\(|setInterval|\/state|\/edit/);
});

test("SCSS generates theme-aware dark, light, and forced-color styling", async () => {
  const bridge = await readFile("runtime/workbench-bridge.ts", "utf8");
  const css = await readFile("../.heap/cache/compiled/main/columns.css", "utf8");
  assert.doesNotMatch(bridge, /\.vscode-editor-columns-host\s*\{/);
  assert.match(css, /var\(--vscode-editor-background\)/);
  assert.match(css, /var\(--vscode-editor-foreground\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
