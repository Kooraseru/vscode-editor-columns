const { spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const cache = join(root, '.heap', 'cache');
const sourceModules = join(root, 'src', 'node_modules');
mkdirSync(cache, { recursive: true });
copyFileSync(join(root, 'src', 'package.json'), join(cache, 'package.json'));
copyFileSync(join(root, 'src', 'package-lock.json'), join(cache, 'package-lock.json'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['ci', '--prefix', cache, '--cache', join(cache, 'npm')], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (lstatSafe(sourceModules)) rmSync(sourceModules, { recursive: true, force: true });
if (existsSync(join(cache, 'src-node_modules'))) rmSync(join(cache, 'src-node_modules'), { recursive: true, force: true });

function lstatSafe(path) {
  try { return lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}
