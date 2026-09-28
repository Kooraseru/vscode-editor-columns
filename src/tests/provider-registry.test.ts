import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

const originalLoad = Module._load;
class Disposable { constructor(dispose) { this.dispose = dispose; } }
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return { Disposable, languages: { match: () => 1 } };
  return originalLoad.call(this, request, parent, isMain);
};
const { ProviderRegistry } = require("../compiled/main/provider-registry.js");
Module._load = originalLoad;

const provider = (id, order) => ({ id, order, provideCells: () => ({ cells: [] }) });

test("numeric ordering uses stable registration order as its tie-breaker", () => {
  const registry = new ProviderRegistry();
  registry.register(provider("late-a", 20));
  registry.register(provider("first", -1));
  registry.register(provider("late-b", 20));
  assert.deepEqual(registry.matching({}).map(item => item.id), ["first", "late-a", "late-b"]);
});

test("registration validates providers and disposes invalidation listeners", () => {
  let listenerDisposed = false;
  const registry = new ProviderRegistry();
  const registration = registry.register({ id: "valid", width: 80, provideCells: () => ({ cells: [] }),
    onDidChangeCells: () => ({ dispose: () => { listenerDisposed = true; } }) });
  assert.throws(() => registry.register(provider("valid")), /already registered/);
  assert.throws(() => registry.register({ id: "bad id", provideCells() {} }), /valid string id/);
  assert.throws(() => registry.register({ id: "wide", width: 801, provideCells() {} }), /between 48 and 800/);
  registration.dispose();
  assert.equal(listenerDisposed, true);
});
