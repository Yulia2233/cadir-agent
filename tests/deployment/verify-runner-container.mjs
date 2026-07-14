import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const image = process.env.RUNNER_IMAGE ?? 'cadir-runner:test';
const name = `cadir-runner-verify-${randomUUID().slice(0, 8)}`;

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...options }).trim();
}

try {
  const user = docker(['image', 'inspect', image, '--format', '{{.Config.User}}']);
  if (user !== '10002:10002') throw new Error(`unexpected image user: ${user}`);

  const health = docker([
    'run',
    '--rm',
    image,
    'python',
    '-c',
    "from cadir_runner.app import installed_sdk_version; from pathlib import Path; assert installed_sdk_version() == '2.0.1b1'; assert Path('/opt/simplecadapi-skill/SKILL.md').is_file(); assert Path('/opt/simplecadapi-skill/references/docs/api/README.md').is_file()",
  ]);
  if (health !== '') process.stdout.write(health);

  const id = docker(['run', '--rm', '--group-add', '10001', image, 'id']);
  if (!id.includes('uid=10002') || !id.includes('10001(cadir-workspace)')) {
    throw new Error(`unexpected runtime identity: ${id}`);
  }

  const writeAttempt = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      image,
      'sh',
      '-c',
      'touch /etc/cadir-should-fail',
    ],
    { stdio: 'ignore' },
  );
  if (writeAttempt.status === 0) throw new Error('read-only root filesystem check failed');

  const networkAttempt = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      image,
      'python',
      '-c',
      "import urllib.request; urllib.request.urlopen('https://example.com', timeout=2)",
    ],
    { stdio: 'ignore' },
  );
  if (networkAttempt.status === 0) throw new Error('network isolation check failed');

  process.stdout.write('runner container verification passed\n');
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
}
