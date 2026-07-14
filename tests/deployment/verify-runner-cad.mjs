import { spawnSync } from 'node:child_process';

const image = process.env.RUNNER_IMAGE ?? 'cadir-runner:dev';
const script = `
from importlib.metadata import version
from pathlib import Path
from simplecadapi import GraphSession, export_model_json, export_step, export_stl, make_box_rsolid, replay_model_json

output = Path('/tmp/cadir-smoke')
output.mkdir()
with GraphSession() as session:
    shape = make_box_rsolid(100.0, 50.0, 5.0)
payload = export_model_json(session)
(output / 'model.json').write_text(payload, encoding='utf-8')
export_step(shape, str(output / 'model.step'))
export_stl(shape, str(output / 'model.stl'))
rebuilt = replay_model_json(payload, strict=True)
assert version('simplecadapi') == '2.0.1b1'
assert len(rebuilt) == 1
assert (output / 'model.step').stat().st_size > 1024
assert (output / 'model.stl').stat().st_size > 1024
assert abs(shape.get_volume() - 25000.0) < 0.001
assert len(shape.get_faces()) == 6
assert len(shape.get_edges()) == 12
print('runner CAD smoke passed')
`;

const result = spawnSync(
  'docker',
  ['run', '--rm', '--network=none', '--entrypoint', 'python', image, '-c', script],
  { encoding: 'utf8' },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}
if (!result.stdout.includes('runner CAD smoke passed')) {
  throw new Error('Runner CAD smoke did not report success');
}
console.log('runner CAD smoke verification passed');
