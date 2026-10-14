import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const compatibility = require("../compiled/main/workbench-compatibility.js");
const installerModule = require("../compiled/main/workbench-installer.js");
const TEST_COMMIT = "example-commit";
const TEST_VERSION = "1.137.0";
const { WorkbenchInstaller, findOwnedBlock, pathsForAppRoot, sha256 } = installerModule;

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "editor-columns-installer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = pathsForAppRoot(root);
  await mkdir(path.dirname(paths.target), { recursive: true });
  const original = `/* supported workbench */\nconst identity = "monaco-editor";\n${"x".repeat(1100)}\n`;
  const bridgePath = path.join(root, "workbench-bridge.js");
  await writeFile(paths.target, original, "utf8");
  await writeFile(bridgePath, `(() => { const token = "__VSCODE_EDITOR_COLUMNS_TOKEN__"; })();`, "utf8");
  const installer = new WorkbenchInstaller({
    appRoot: root,
    version: TEST_VERSION,
    commit: TEST_COMMIT,
    bridgePath
  });
  return { installer, original, paths, root, bridgePath };
}

test("install is owned, metadata-backed, and idempotent", async t => {
  const { installer, original, paths } = await fixture(t);
  assert.equal(await installer.install("secret"), true);
  assert.equal(await installer.install("secret"), false);
  assert.equal(await installer.status("secret"), "installed");
  const current = await readFile(paths.target, "utf8");
  const backup = await readFile(paths.backup, "utf8");
  const state = JSON.parse(await readFile(paths.state, "utf8"));
  assert.ok(findOwnedBlock(current));
  assert.equal(backup, original);
  assert.equal(state.schema, 1);
  assert.equal(state.vscodeVersion, TEST_VERSION);
  assert.equal(state.vscodeCommit, TEST_COMMIT);
  assert.equal(state.originalSha256, sha256(original));
  assert.equal(state.patchedSha256, sha256(current));
  assert.equal(state.bridgeSchema, 1);
  assert.equal(typeof state.installationId, "string");
  assert.equal(typeof state.installedAt, "string");
});

test("an owned bridge updates to the new renderer and keeps a restorable backup", async t => {
  const { installer, original, paths, bridgePath } = await fixture(t);
  await installer.install("secret");
  await writeFile(bridgePath, `(() => { const token = "__VSCODE_EDITOR_COLUMNS_TOKEN__"; const version = 2; })();`, "utf8");
  assert.equal(await installer.status("secret"), "update-available");
  assert.equal(await installer.install("secret"), true);
  assert.equal(await installer.status("secret"), "installed");
  assert.equal(await readFile(paths.backup, "utf8"), original);
  assert.equal(await installer.remove(), true);
  assert.equal(await readFile(paths.target, "utf8"), original);
});

test("removal preserves content added after the owned block", async t => {
  const { installer, original, paths } = await fixture(t);
  await installer.install("secret");
  await writeFile(paths.target, `${await readFile(paths.target, "utf8")}\n/* another-tool */`, "utf8");
  assert.equal(await installer.status("secret"), "installed-modified");
  assert.equal(await installer.remove(), true);
  assert.equal(await readFile(paths.target, "utf8"), `${original}\n/* another-tool */`);
  await assert.rejects(readFile(paths.state, "utf8"), error => error.code === "ENOENT");
  await assert.rejects(readFile(paths.backup, "utf8"), error => error.code === "ENOENT");
});

test("removal rejects a stale backup without mutating the workbench", async t => {
  const { installer, paths } = await fixture(t);
  await installer.install("secret");
  const patched = await readFile(paths.target, "utf8");
  await writeFile(paths.backup, "stale backup", "utf8");
  await assert.rejects(installer.remove(), /stale or modified/);
  assert.equal(await readFile(paths.target, "utf8"), patched);
});

test("different VS Code versions and commits can install when the workbench structure loads", async t => {
  const { original, paths, root, bridgePath } = await fixture(t);
  const installer = new WorkbenchInstaller({ appRoot: root, bridgePath, version: "1.138.0", commit: "new-commit" });
  assert.equal(await installer.install("secret"), true);
  assert.equal(await installer.status("secret"), "installed");
  assert.equal(await installer.remove(), true);
  assert.equal(await readFile(paths.target, "utf8"), original);
});

test("workbench without required editor structure fails before mutation", async t => {
  const { paths, root, bridgePath } = await fixture(t);
  await writeFile(paths.target, "not a supported workbench", "utf8");
  const installer = new WorkbenchInstaller({
    appRoot: root,
    version: "1.138.0",
    commit: "new-commit",
    bridgePath
  });
  await assert.rejects(installer.install("secret"), /does not contain/);
  assert.equal(await readFile(paths.target, "utf8"), "not a supported workbench");
});
