import { spawnSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';

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

function output(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

function parseVersion(value) {
  const [major = 0, minor = 0] = value.match(/\d+/g)?.map(Number) ?? [];
  return { major, minor };
}

function assertMinimumVersion(label, value, minimumMajor, minimumMinor = 0) {
  const version = parseVersion(value);
  if (
    version.major < minimumMajor ||
    (version.major === minimumMajor && version.minor < minimumMinor)
  ) {
    throw new Error(`${label} ${minimumMajor}.${minimumMinor}+ is required; found ${value}`);
  }
}

function checkEnvironment() {
  if (process.platform !== 'linux') {
    throw new Error('Production deployment requires a Linux Docker host');
  }
  accessSync(envFile, constants.R_OK);
  const envMode = statSync(envFile).mode & 0o777;
  if ((envMode & 0o077) !== 0) {
    throw new Error(`${envFile} must not be readable or writable by group or other users`);
  }
  const serverPlatform = output('docker', ['info', '--format', '{{.OSType}}/{{.Architecture}}']);
  if (serverPlatform !== 'linux/x86_64') {
    throw new Error(`Production deployment requires linux/amd64; found ${serverPlatform}`);
  }
  const dockerVersion = output('docker', ['version', '--format', '{{.Server.Version}}']);
  assertMinimumVersion('Docker Engine', dockerVersion, 27);
  const composeVersion = output('docker', ['compose', 'version', '--short']);
  assertMinimumVersion('Docker Compose', composeVersion, 2, 24);
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
