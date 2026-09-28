const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const cache = join(root, '.heap', 'cache');
const binary = join(cache, 'toolchain', 'bin', process.platform === 'win32' ? 'lune.exe' : 'lune');
const modules = join(cache, 'node_modules');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo';

function run(program, args, env = process.env) {
  const result = spawnSync(program, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) {
    console.error(`${program}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(cache, { recursive: true });
if (!existsSync(modules)) run(process.execPath, [join(__dirname, 'install-dependencies.cjs')]);
if (!existsSync(binary)) {
  console.log('Installing pinned Lune 0.10.5 into .heap/cache/toolchain/');
  run(cargo, [
    'install', 'lune', '--version', '0.10.5', '--locked',
    '--root', join(cache, 'toolchain'), '--target-dir', join(cache, 'cargo-target'),
  ]);
}
const env = {
  ...process.env,
  PATH: `${join(cache, 'toolchain', 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
};
run(npm, ['--prefix', 'src', 'run', 'package'], env);
