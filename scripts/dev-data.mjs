import { spawnSync } from 'node:child_process';

const action = process.argv[2] ?? 'help';
const compose = ['compose', '--env-file', '.env', '-f', 'infra/compose.yaml'];

function run(args) {
  const result = spawnSync('docker', [...compose, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (action === 'init') {
  // Seed requires explicit credentials and is idempotent through Prisma upsert.
  run(['exec', '-T', 'api', 'node', 'dist/../node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts']);
} else if (action === 'clean') {
  // Keep volumes and schema intact; only remove application rows through a
  // separately approved Prisma command in future environments.
  process.stdout.write(
    'Non-destructive clean: no data was removed. Use docker compose down without --volumes.\n',
  );
} else {
  process.stdout.write('Usage: node scripts/dev-data.mjs {init|clean}\n');
  process.exitCode = action === 'help' ? 0 : 2;
}
