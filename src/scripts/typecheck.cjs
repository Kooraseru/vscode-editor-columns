const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const compiler = join(root, '.heap', 'cache', 'node_modules', 'typescript', 'bin', 'tsc');
for (const config of ['tsconfig.json', 'tsconfig.workbench.json']) {
  const result = spawnSync(process.execPath, [compiler, '-p', config, '--noEmit'], {
    cwd: join(root, 'src'),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
