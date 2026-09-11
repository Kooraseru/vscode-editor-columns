import assert from "node:assert/strict";
import test from "node:test";
import { resolveRelease } from "../scripts/resolve-release.mjs";

test("publication metadata resolves to the extension and release record", async () => {
  const release = await resolveRelease("..");
  assert.equal(release.record, "2026.09.1-regular");
  assert.equal(release.version, "0.1.0");
  assert.equal(release.tag, "v0.1.0");
  assert.equal(typeof release.enabled, "boolean");
});
