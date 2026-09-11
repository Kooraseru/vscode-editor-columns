import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import process from "node:process";

function run(command, args, cwd = process.cwd(), shell = false) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/check.mjs"]);
run(process.execPath, ["scripts/build.mjs"]);

const npmArgs = [
  "exec",
  "--cache", "../cache/npm",
  "--yes",
  "--package", "@vscode/vsce@3.6.0",
  "--",
  "vsce", "package",
  "--allow-missing-repository",
  "--out", "../release/vscode-editor-columns-0.1.0.vsix"
];
if (process.platform === "win32") {
  run(process.env.ComSpec, ["/d", "/s", "/c", `npm ${npmArgs.join(" ")}`], "../.generated/main");
} else {
  run("npm", npmArgs, "../.generated/main");
}

const debugArgs = [
  "exec",
  "--cache", "../../.generated/cache/npm",
  "--yes",
  "--package", "@vscode/vsce@3.6.0",
  "--",
  "vsce", "package",
  "--allow-missing-repository",
  "--out", "../../.generated/release/debug.vsix"
];
if (process.platform === "win32") {
  run(process.env.ComSpec, ["/d", "/s", "/c", `npm ${debugArgs.join(" ")}`], "debug-extension");
} else {
  run("npm", debugArgs, "debug-extension");
}

await rm("../.generated/cache", { recursive: true, force: true });
console.log("Packaged distributables in .generated/release/ and removed .generated/cache/.");
