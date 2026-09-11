import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bridge exposes provider and native source headers", async () => {
  const bridge = await readFile("workbench-bridge.js", "utf8");
  assert.match(bridge, /sourceHeader\.textContent = "SOURCE"/);
  assert.match(bridge, /header\.textContent = definition\.label/);
});

test("debug consumer registers address and encoding providers", async () => {
  const consumer = await readFile("debug-extension/extension.js", "utf8");
  assert.match(consumer, /"ADDRESS"/);
  assert.match(consumer, /"ENCODING"/);
  assert.match(consumer, /registerColumnProvider/g);
});
