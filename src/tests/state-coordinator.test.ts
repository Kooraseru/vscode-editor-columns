import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

const originalLoad = Module._load;
class CancellationTokenSource {
  token = { isCancellationRequested: false };
  cancel() { this.token.isCancellationRequested = true; }
  dispose() {}
}
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return { window: { visibleTextEditors: [] }, CancellationTokenSource };
  return originalLoad.call(this, request, parent, isMain);
};
const { StateCoordinator } = require("../compiled/main/state-coordinator.js");
Module._load = originalLoad;

const documentFor = id => ({ uri: { toString: () => `file:///${id}` } });
const editorFor = (document, start = 0, end = 0) => ({ document, visibleRanges: [{ start: { line: start }, end: { line: end } }] });

test("state is independent for two visible documents and unaffected by focus", async () => {
  const published = [];
  const registry = { matching: document => [{ id: "value", provideCells: async (_document, range) => ({
    cells: [{ line: range.start, value: `${document.uri}:${range.start}` }] }) }] };
  const coordinator = new StateCoordinator(registry, snapshot => published.push(snapshot));
  const first = editorFor(documentFor("first"));
  const second = editorFor(documentFor("second"));
  await coordinator.syncVisibleEditors([first, second]);
  const snapshot = published.at(-1);
  assert.equal(snapshot.editors.length, 2);
  assert.equal(snapshot.editors[0].columns[0].cells[0].value, "file:///first:0");
  assert.equal(snapshot.editors[1].columns[0].cells[0].value, "file:///second:0");
  assert.equal(snapshot.editors[0].columns[0].cells[0].editable, false);
  await coordinator.syncVisibleEditors([first, second]);
  assert.equal(published.at(-1).editors[0].documentId, "file:///first");
});

test("a stale asynchronous refresh cannot overwrite the newer revision", async () => {
  const published = [];
  let release;
  let call = 0;
  const registry = { matching: () => [{ id: "value", provideCells: async (_document, range, token) => {
    call += 1;
    if (call === 1) await new Promise(resolve => { release = resolve; });
    return { cells: [{ line: range.start, value: `call-${call}`, editable: true }] };
  } }] };
  const coordinator = new StateCoordinator(registry, snapshot => published.push(snapshot));
  const editor = editorFor(documentFor("race"));
  const oldRefresh = coordinator.syncVisibleEditors([editor]);
  const newRefresh = coordinator.refreshEditor(editor);
  await newRefresh;
  release();
  await oldRefresh;
  assert.equal(published.at(-1).editors[0].columns[0].cells[0].value, "call-2");
});

test("scrolling reuses analyzed lines and only requests newly visible lines", async () => {
  const requests = [];
  const provider = { id: "value", provideCells: async (_document, range) => {
    requests.push([range.start, range.end]);
    return { cells: Array.from({ length: range.end - range.start }, (_, index) => ({ line: range.start + index, value: String(range.start + index) })) };
  } };
  const registry = { matching: () => [provider] };
  const coordinator = new StateCoordinator(registry, () => undefined);
  const editor = editorFor({ ...documentFor("scroll"), version: 1 }, 10, 12);
  await coordinator.syncVisibleEditors([editor]);
  editor.visibleRanges = [{ start: { line: 11 }, end: { line: 13 } }];
  await coordinator.refreshEditor(editor);
  editor.visibleRanges = [{ start: { line: 10 }, end: { line: 12 } }];
  await coordinator.refreshEditor(editor);
  assert.deepEqual(requests, [[10, 13], [13, 14]]);
  assert.equal([...coordinator.records.values()][0].snapshot.columns[0].cells[10].value, "10");
});

test("edits route to their editor and reject a stale revision", async () => {
  const edits = [];
  const provider = { id: "value", provideCells: async (_document, range) => ({ cells: [{ line: range.start, value: "cell", editable: true }] }),
    applyEdit: async (document, edit) => edits.push([document.uri.toString(), edit.line, edit.value]) };
  const registry = { matching: () => [provider], get: () => provider };
  const coordinator = new StateCoordinator(registry, () => undefined);
  const first = editorFor(documentFor("first")), second = editorFor(documentFor("second"));
  await coordinator.syncVisibleEditors([first, second]);
  const record = [...coordinator.records.values()][1];
  const edit = { documentId: record.documentId, editorId: record.editorId, revision: record.revision,
    columnId: "value", line: 0, value: "changed" };
  await coordinator.applyEdit(edit);
  assert.deepEqual(edits, [["file:///second", 0, "changed"]]);
  await assert.rejects(coordinator.applyEdit(edit), /stale-edit/);
});

test("provider failures are isolated and invalidation refreshes only relevant visible state", async () => {
  const logs = [], published = [];
  const broken = { id: "broken", provideCells: async () => { throw new Error("boom"); } };
  const good = { id: "good", provideCells: async (_document, range) => ({ cells: [{ line: range.start, value: "ok" }] }) };
  const registry = { matching: () => [broken, good] };
  const coordinator = new StateCoordinator(registry, snapshot => published.push(snapshot), message => logs.push(message));
  const editor = editorFor(documentFor("relevant"));
  await coordinator.syncVisibleEditors([editor]);
  assert.deepEqual(published.at(-1).editors[0].columns.map(column => column.id), ["good"]);
  assert.match(logs[0], /broken.*boom/);
  const revision = [...coordinator.records.values()][0].revision;
  await coordinator.invalidate(good, { document: editor.document.uri, range: { start: 0, end: 1 } });
  assert.ok([...coordinator.records.values()][0].revision > revision);
});
