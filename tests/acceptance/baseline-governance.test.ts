import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = path.resolve(process.cwd(), '..');
const projectRoot = process.cwd();

async function readWorkspace(relativePath: string): Promise<string> {
  return readFile(path.join(workspaceRoot, relativePath), 'utf8');
}

async function readProject(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

describe('frozen product scope', () => {
  it('keeps the authoritative sources aligned with the signed scope baseline', async () => {
    const [scope, requirements, todo, acceptance] = await Promise.all([
      readProject('docs/baseline/PRODUCT_SCOPE.md'),
      readWorkspace('CAD_AGENT_WEB_REQUIREMENTS.md'),
      readWorkspace('todo.md'),
      readWorkspace('to_test.md'),
    ]);

    expect(scope).toContain('Status: Frozen for the current release');
    expect(scope).toContain('No native App client is included');
    expect(scope).toContain('SimpleCADAPI as the only canonical modeling backend');
    expect(scope).toContain('Use FreeCAD as the only conversion backend');
    expect(scope).toContain('Build only complete model Cases');
    expect(scope).toContain('human approval before publication');

    expect(requirements).toContain('Fusion 360 和 SolidWorks 转换明确不在本期范围');
    expect(requirements).toContain('FreeCAD 转换必须以同一份 canonical Model JSON 为输入');
    expect(todo).toContain('- App 客户端。');
    expect(todo).toContain('- SolidWorks 转换。');
    expect(todo).toContain('- Fusion 360 转换。');
    expect(todo).toContain('- 方法 Case、失败经验库。');
    expect(todo).toContain('- 候选 Case 自动发布。');
    expect(acceptance).toContain('仅包含后端和 Web，不包含 App');
    expect(acceptance).toContain('| CAD-002 | 不开启 FreeCAD |');
    expect(acceptance).toContain('| CAD-003 | 开启 FreeCAD 转换 |');
  });

  it('keeps forbidden conversion choices out of the delivered Web source', async () => {
    const files = ['apps/web/src/App.tsx', 'apps/web/src/components/Composer.tsx'];
    const source = (await Promise.all(files.map(readProject))).join('\n').toLowerCase();

    expect(source).not.toContain('solidworks');
    expect(source).not.toContain('fusion 360');
    expect(source).toContain('freecad');
  });
});

describe('security boundary and threat-model governance', () => {
  it('maps every required P0 threat family to preventive and recovery controls', async () => {
    const model = await readProject('docs/adr/0002-security-and-isolation-boundaries.md');
    const requiredThreats = [
      'Authentication bypass and role escalation',
      'IDOR across conversations',
      'SSRF through Provider configuration',
      'API key and sensitive-content disclosure',
      'Prompt injection and privilege escalation',
      'Path traversal, link escape, Zip Slip, and TOCTOU',
      'Sandbox breakout and resource abuse',
      'Concurrent overwrite and late publication',
      'XSS, CSRF, and SQL injection',
      'Candidate leakage or malicious publication',
      'Corrupt or confused CAD artifacts',
      'Selection confusion across revisions',
    ];

    for (const threat of requiredThreats) expect(model).toContain(threat);
    expect(model).toContain('## Detection and recovery');
    expect(model).toContain('OpenCode Permission remains defense in depth');
    expect(model).toContain('The browser reaches only the CADIR API');
    expect(model).toContain('cannot invoke arbitrary shell commands');
  });

  it('keeps OpenCode internal and the restricted Agent default-deny in deployment', async () => {
    const [compose, openCodeConfig] = await Promise.all([
      readProject('infra/compose.yaml'),
      readProject('packages/opencode-cadir/runtime/opencode.json'),
    ]);
    const openCodeStart = compose.indexOf('\n  opencode:\n');
    const runnerStart = compose.indexOf('\n  runner:\n', openCodeStart);
    const webStart = compose.indexOf('\n  web:\n');
    const freeCadStart = compose.indexOf('\n  freecad-worker:\n', webStart);
    const openCodeBlock = compose.slice(openCodeStart, runnerStart);
    const webBlock = compose.slice(webStart, freeCadStart);

    expect(openCodeStart).toBeGreaterThan(-1);
    expect(runnerStart).toBeGreaterThan(openCodeStart);
    expect(openCodeBlock).not.toMatch(/^\s+ports:/m);
    expect(openCodeBlock).toContain('read_only: true');
    expect(webBlock).not.toContain('opencode');
    expect(openCodeConfig).toContain('"*": "deny"');
    for (const forbidden of ['shell', 'bash', 'network', 'install_package', 'read_environment']) {
      expect(openCodeConfig).not.toMatch(new RegExp(`"${forbidden}"\\s*:\\s*"allow"`));
    }
  });
});
