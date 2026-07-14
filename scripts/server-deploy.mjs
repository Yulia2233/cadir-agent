import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

const action = process.argv[2] ?? 'check';
const envFile = process.env.CADIR_ENV_FILE ?? '/etc/cadir/cadir.env';
const edgeNetwork = process.env.EDGE_NETWORK ?? 'cadir-edge';
const composeArgs = [
  'compose',
  '--env-file',
  envFile,
  '-f',
  'infra/compose.yaml',
  '-f',
  'infra/compose.server.yaml',
  '-f',
  'infra/compose.production.yaml',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function checkEnvironment() {
  if (process.platform !== 'linux') {
    throw new Error('Production deployment requires a Linux Docker host');
  }
  accessSync(envFile, constants.R_OK);
  run('docker', ['version', '--format', '{{.Server.Version}}']);
  run('docker', ['compose', 'version']);
  run('docker', [...composeArgs, 'config', '--quiet']);
}

try {
  if (!['check', 'up', 'health', 'down'].includes(action)) {
    throw new Error('Usage: server-deploy.mjs {check|up|health|down}');
  }
  if (action !== 'down') checkEnvironment();
  if (action === 'check') process.exit(0);
  if (action === 'up') {
    const inspect = spawnSync('docker', ['network', 'inspect', edgeNetwork], { stdio: 'ignore' });
    if (inspect.status !== 0) run('docker', ['network', 'create', edgeNetwork]);
    run('docker', [...composeArgs, 'up', '-d', '--build', '--remove-orphans', '--wait']);
  } else if (action === 'health') {
    run('docker', [...composeArgs, 'ps']);
    run('docker', [
      ...composeArgs,
      'exec',
      '-T',
      'api',
      'node',
      '-e',
      "fetch('http://127.0.0.1:8080/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
    ]);
    run('docker', [
      ...composeArgs,
      'exec',
      '-T',
      'runner',
      'python',
      '-c',
      "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health/ready', timeout=3)",
    ]);
  } else {
    run('docker', [...composeArgs, 'down']);
  }
} catch (error) {
  process.stderr.write(
    `Deployment check failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
