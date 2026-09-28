const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  validateWorkbenchSource
} = require("./workbench-compatibility");

const STATE_SCHEMA = 1;
const BRIDGE_SCHEMA = 1;
const BEGIN_PREFIX = "/* vscode-editor-columns:begin:";
const END_MARKER = "/* vscode-editor-columns:end */";
const LEGACY_MARKER = "vscode-editor-columns-workbench-bridge";

type InstallerMetadata = {
  schema: number;
  vscodeVersion: string;
  vscodeCommit: string;
  targetPath: string;
  backupPath: string;
  originalSha256: string;
  patchedSha256: string;
  bridgeSchema: number;
  bridgeDigest: string;
  installationId: string;
  installedAt: string;
};

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pathsForAppRoot(appRoot: string) {
  const target = path.join(appRoot, "out", "vs", "workbench", "workbench.desktop.main.js");
  return {
    target,
    backup: `${target}.vscode-editor-columns.backup`,
    state: `${target}.vscode-editor-columns.json`
  };
}

function encodeMarker(metadata: object): string {
  return Buffer.from(JSON.stringify(metadata)).toString("base64url");
}

function ownedBlock(bridge: string, marker: object): string {
  return `\n${BEGIN_PREFIX}${encodeMarker(marker)} */\n${bridge}\n${END_MARKER}`;
}

function findOwnedBlock(source: string) {
  const pattern = /\n?\/\* vscode-editor-columns:begin:([A-Za-z0-9_-]+) \*\/\n([\s\S]*?)\n\/\* vscode-editor-columns:end \*\//g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length > 1) throw new Error("Multiple Editor Columns workbench blocks were found; refusing mutation.");
  if (!matches.length) return undefined;
  let marker: any;
  try { marker = JSON.parse(Buffer.from(matches[0][1], "base64url").toString("utf8")); }
  catch { throw new Error("The Editor Columns workbench marker is malformed."); }
  return { text: matches[0][0], marker, bridge: matches[0][2], index: matches[0].index! };
}

function removeOwnedBlock(source: string, expected?: InstallerMetadata): string {
  const block = findOwnedBlock(source);
  if (!block) throw new Error("The recorded Editor Columns workbench block is missing.");
  if (expected && (block.marker.installationId !== expected.installationId ||
      block.marker.bridgeDigest !== expected.bridgeDigest || sha256(block.bridge) !== expected.bridgeDigest)) {
    throw new Error("The Editor Columns workbench block does not match its installation metadata.");
  }
  return source.slice(0, block.index) + source.slice(block.index + block.text.length);
}

function removeCurrentLegacyBlock(source: string, bridge: string): string {
  const bridgeDigest = sha256(bridge);
  const markerPattern = /\n\/\* vscode-editor-columns-workbench-bridge:([A-Za-z0-9_-]+) \*\/\n/g;
  for (const match of source.matchAll(markerPattern)) {
    try {
      const metadata = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      const exact = `${match[0]}${bridge}`;
      if (metadata.digest === bridgeDigest && source.slice(match.index, match.index! + exact.length) === exact) {
        return source.slice(0, match.index) + source.slice(match.index! + exact.length);
      }
    } catch {}
  }
  if (source.includes(LEGACY_MARKER)) throw new Error("An unverifiable legacy Editor Columns bridge is installed; refusing mutation.");
  return source;
}

async function readJson(file: string): Promise<any | undefined> {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Invalid installer metadata at ${file}: ${(error as Error).message}`);
  }
}

async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  await fs.writeFile(temporary, data);
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    try { await fs.unlink(temporary); } catch {}
    throw error;
  }
}

async function restoreFile(file: string, previous: Buffer | undefined): Promise<void> {
  if (previous === undefined) {
    try { await fs.unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  } else {
    await atomicWrite(file, previous);
  }
}

class WorkbenchInstaller {
  appRoot: string;
  version: string;
  commit: string;
  bridgePath: string;
  log: (message: string) => void;
  paths: ReturnType<typeof pathsForAppRoot>;

  constructor(options: { appRoot: string; version: string; commit: string; bridgePath: string; log?: (message: string) => void }) {
    this.appRoot = options.appRoot;
    this.version = options.version;
    this.commit = options.commit;
    this.bridgePath = options.bridgePath;
    this.log = options.log ?? (() => undefined);
    this.paths = pathsForAppRoot(options.appRoot);
  }

  private validateBuild(source: string): void {
    validateWorkbenchSource(source);
  }

  async renderBridge(token: string): Promise<{ bridge: string; digest: string }> {
    const template = await fs.readFile(this.bridgePath, "utf8");
    const bridge = template.replace("__VSCODE_EDITOR_COLUMNS_TOKEN__", token);
    return { bridge, digest: sha256(bridge) };
  }

  async status(token: string): Promise<string> {
    let source: string;
    try { source = await fs.readFile(this.paths.target, "utf8"); }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "not-installed" : "failed"; }
    try { this.validateBuild(source); } catch { return "incompatible"; }
    const state = await readJson(this.paths.state) as InstallerMetadata | undefined;
    const block = findOwnedBlock(source);
    if (!block) return "not-installed";
    const rendered = await this.renderBridge(token);
    if (!state || state.schema !== STATE_SCHEMA ||
        block.marker.installationId !== state.installationId || sha256(block.bridge) !== state.bridgeDigest) return "failed";
    if (state.bridgeDigest !== rendered.digest) return "update-available";
    return sha256(source) === state.patchedSha256 ? "installed" : "installed-modified";
  }

  async install(token: string): Promise<boolean> {
    const current = await fs.readFile(this.paths.target, "utf8");
    this.validateBuild(current);
    const rendered = await this.renderBridge(token);
    const existing = findOwnedBlock(current);
    let original: string;
    if (existing) {
      const state = await readJson(this.paths.state) as InstallerMetadata | undefined;
      if (!state || state.schema !== STATE_SCHEMA || existing.marker.installationId !== state.installationId ||
          sha256(existing.bridge) !== state.bridgeDigest) {
        throw new Error("An unverifiable Editor Columns bridge block is installed; refusing mutation.");
      }
      if (state.bridgeDigest === rendered.digest) return false;
      const backup = await fs.readFile(this.paths.backup, "utf8");
      if (sha256(backup) !== state.originalSha256) throw new Error("Workbench backup is stale or modified; refusing update.");
      original = removeOwnedBlock(current, state);
    } else {
      original = removeCurrentLegacyBlock(current, rendered.bridge);
    }
    this.validateBuild(original);
    const installationId = crypto.randomUUID();
    const marker = { schema: BRIDGE_SCHEMA, bridgeDigest: rendered.digest, installationId };
    const patched = `${original}${ownedBlock(rendered.bridge, marker)}`;
    const metadata: InstallerMetadata = {
      schema: STATE_SCHEMA,
      vscodeVersion: this.version,
      vscodeCommit: this.commit,
      targetPath: this.paths.target,
      backupPath: this.paths.backup,
      originalSha256: sha256(original),
      patchedSha256: sha256(patched),
      bridgeSchema: BRIDGE_SCHEMA,
      bridgeDigest: rendered.digest,
      installationId,
      installedAt: new Date().toISOString()
    };
    await fs.access(path.dirname(this.paths.target), fs.constants.W_OK);
    const previousBackup = await fs.readFile(this.paths.backup).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    const previousState = await fs.readFile(this.paths.state).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    let backupWritten = false;
    let targetWritten = false;
    let stateWritten = false;
    try {
      await atomicWrite(this.paths.backup, original);
      backupWritten = true;
      await atomicWrite(this.paths.target, patched);
      targetWritten = true;
      await atomicWrite(this.paths.state, `${JSON.stringify(metadata, null, 2)}\n`);
      stateWritten = true;
    } catch (error) {
      if (targetWritten) await atomicWrite(this.paths.target, current);
      if (backupWritten) await restoreFile(this.paths.backup, previousBackup);
      if (stateWritten) await restoreFile(this.paths.state, previousState);
      throw error;
    }
    return true;
  }

  async remove(): Promise<boolean> {
    const metadata = await readJson(this.paths.state) as InstallerMetadata | undefined;
    if (!metadata) return false;
    if (metadata.schema !== STATE_SCHEMA ||
        path.resolve(metadata.targetPath) !== path.resolve(this.paths.target) ||
        path.resolve(metadata.backupPath) !== path.resolve(this.paths.backup) || metadata.bridgeSchema !== BRIDGE_SCHEMA) {
      throw new Error("Installer metadata does not match this VS Code workbench generation.");
    }
    const [current, backup] = await Promise.all([
      fs.readFile(this.paths.target, "utf8"),
      fs.readFile(this.paths.backup, "utf8")
    ]);
    if (sha256(backup) !== metadata.originalSha256) throw new Error("Workbench backup is stale or modified; refusing restore.");
    const restored = removeOwnedBlock(current, metadata);
    if (sha256(current) === metadata.patchedSha256 && sha256(restored) !== metadata.originalSha256) {
      throw new Error("Patched workbench does not restore to the recorded original generation.");
    }
    this.validateBuild(restored);
    await fs.access(path.dirname(this.paths.target), fs.constants.W_OK);
    await atomicWrite(this.paths.target, restored);
    await Promise.all([fs.unlink(this.paths.state), fs.unlink(this.paths.backup)]);
    return true;
  }
}

export {
  BEGIN_PREFIX,
  BRIDGE_SCHEMA,
  END_MARKER,
  STATE_SCHEMA,
  WorkbenchInstaller,
  findOwnedBlock,
  pathsForAppRoot,
  removeOwnedBlock,
  sha256
};
