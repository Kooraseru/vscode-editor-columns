import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bridge exposes provider and native source headers", async () => {
  const bridge = await readFile("../.heap/cache/compiled/main/workbench-bridge.js", "utf8");
  assert.match(bridge, /sourceHeader\.textContent = "SOURCE"/);
  assert.match(bridge, /header\.textContent = definition\.label/);
});
