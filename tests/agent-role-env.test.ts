import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { OSQ_END_MARKER, OSQ_START_MARKER } from '../src/core/foundation/init.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { getHarnessAdapter } from '../src/harness/index.js';
import { OpencodeAdapter } from '../src/harness/opencode/opencode.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

/**
 * Fake harness binary: prints a version for probes and otherwise records the
 * whole child environment to `OSQ_FAKE_ENV_RECORD`. `OSQ_FAKE_ENV_RECORD`
 * reaches the child because every `OSQ_` variable passes the role allowlist.
 */
const FAKE_BIN_SOURCE = `#!/usr/bin/env node
import fs from 'node:fs';

const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  process.stdout.write('1.0.0 (agent-role-env fake)\\n');
  process.exit(0);
}
const recordPath = process.env.OSQ_FAKE_ENV_RECORD;
if (recordPath) fs.writeFileSync(recordPath, JSON.stringify(process.env));
process.exit(0);
`;

const ADAPTER_SOURCES = [
  'src/harness/agy/agy.ts',
  'src/harness/claude/claude-exec.ts',
  'src/harness/codex/codex.ts',
  'src/harness/opencode/opencode.ts',
  'src/harness/pi/pi.ts',
];

const TRACKED_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AGENT_PROBE',
  'SECRET_PROBE',
  'OSQ_FAKE_ENV_RECORD',
];

interface FakeProject {
  root: string;
  specFolder: string;
  bin: string;
}

async function createFakeProject(prefix: string): Promise<FakeProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `osq-${prefix}-`));
  const specFolder = path.join(root, 'openspec', 'changes', 'env-change');
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(specFolder, 'tasks', '1.md'),
    ['---', 'title: When the agent runs', 'verify: node -e "process.exit(0)"', '---', ''].join(
      '\n',
    ),
    'utf8',
  );
  const bin = path.join(root, 'fake-agent-env.mjs');
  await fs.writeFile(bin, FAKE_BIN_SOURCE, { mode: 0o755 });
  return { root, specFolder, bin };
}

function spawnOptions(project: FakeProject, config: OsqConfig): SpawnTaskOptions {
  return {
    projectRoot: project.root,
    specFolderPath: project.specFolder,
    taskNumber: '1',
    taskTitle: 'When the agent runs',
    verifyCommand: 'node -e "process.exit(0)"',
    scope: [],
    entry: [],
    skills: [],
    tier: 'coding',
    config,
  };
}

function saveEnv(): Map<string, string | undefined> {
  return new Map(TRACKED_ENV.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved: Map<string, string | undefined>): void {
  for (const [key, value] of saved) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

async function readEnvRecord(recordPath: string): Promise<Record<string, string>> {
  return JSON.parse(await fs.readFile(recordPath, 'utf8')) as Record<string, string>;
}

describe('agent role environment', () => {
  let project: FakeProject;
  let saved: Map<string, string | undefined>;

  beforeEach(async () => {
    saved = saveEnv();
    project = await createFakeProject('agent-role-env');
  });

  afterEach(async () => {
    restoreEnv(saved);
    await fs.rm(project.root, { recursive: true, force: true });
  });

  it('gives a Claude task only the agent role environment', async () => {
    const recordPath = path.join(project.root, 'claude-env.json');
    process.env.OSQ_FAKE_ENV_RECORD = recordPath;
    process.env.ANTHROPIC_API_KEY = 'sk-anthropic';
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.SECRET_PROBE = 'secret';

    const config = defineConfig({ harness: 'claude', claude: { bin: project.bin } });
    const result = await getHarnessAdapter('claude').spawn(spawnOptions(project, config));
    assert.equal(result.exitCode, 0);

    const record = await readEnvRecord(recordPath);
    assert.equal(record.ANTHROPIC_API_KEY, 'sk-anthropic');
    assert.equal(record.OSQ_TASK_NUMBER, '1');
    assert.equal(record.OSQ_SPEC_FOLDER, project.specFolder);
    assert.equal(record.OPENAI_API_KEY, undefined);
    assert.equal(record.SECRET_PROBE, undefined);
  });

  it('gives a Codex task a configured agent name', async () => {
    const recordPath = path.join(project.root, 'codex-env.json');
    process.env.OSQ_FAKE_ENV_RECORD = recordPath;
    process.env.AGENT_PROBE = 'agent';
    process.env.SECRET_PROBE = 'secret';

    const config = defineConfig({
      harness: 'codex',
      codex: { bin: project.bin },
      confinement: { roles: { agent: { env: ['AGENT_PROBE'] } } },
    });
    const result = await getHarnessAdapter('codex').spawn(spawnOptions(project, config));
    assert.equal(result.exitCode, 0);

    const record = await readEnvRecord(recordPath);
    assert.equal(record.AGENT_PROBE, 'agent');
    assert.equal(record.SECRET_PROBE, undefined);
  });

  it('does not leak a secret to a Pi task', async () => {
    const recordPath = path.join(project.root, 'pi-env.json');
    process.env.OSQ_FAKE_ENV_RECORD = recordPath;
    process.env.ANTHROPIC_API_KEY = 'sk-anthropic';
    process.env.SECRET_PROBE = 'secret';

    const config = defineConfig({ harness: 'pi', pi: { bin: project.bin } });
    const result = await getHarnessAdapter('pi').spawn(spawnOptions(project, config));
    assert.equal(result.exitCode, 0);

    const record = await readEnvRecord(recordPath);
    assert.equal(record.ANTHROPIC_API_KEY, 'sk-anthropic');
    assert.equal(record.OSQ_TASK_NUMBER, '1');
    assert.equal(record.SECRET_PROBE, undefined);
  });

  it('keeps an existing opencode agent file permissions on setup', async () => {
    const agentDir = path.join(project.root, '.opencode', 'agent');
    await fs.mkdir(agentDir, { recursive: true });
    const agentPath = path.join(agentDir, 'osq-coder.md');
    await fs.writeFile(
      agentPath,
      [
        '---',
        'description: Existing user agent',
        'mode: all',
        'permission:',
        '  read: allow',
        '  edit: allow',
        '  bash: allow',
        '  glob: allow',
        '  grep: allow',
        '  webfetch: deny',
        '  websearch: deny',
        '---',
        '',
        OSQ_START_MARKER,
        'old managed content',
        OSQ_END_MARKER,
        '',
      ].join('\n'),
      'utf8',
    );

    await new OpencodeAdapter().setup(project.root, DEFAULT_CONFIG);

    const updated = await fs.readFile(agentPath, 'utf8');
    const { data, body } = parseFrontmatter(updated);
    const perms = (data.permission ?? data.permissions) as Record<string, unknown>;
    assert.equal(perms.bash, 'allow', 'existing bash permission should stay allow');
    assert.equal(body.includes('old managed content'), false, 'managed block should be refreshed');
  });

  it('never spreads process.env in an adapter task spawn', async () => {
    for (const relative of ADAPTER_SOURCES) {
      const absolute = path.resolve(import.meta.dirname, '..', relative);
      const source = await fs.readFile(absolute, 'utf8');
      assert.equal(
        source.includes('...process.env'),
        false,
        `${relative} must not spread process.env`,
      );
    }
  });
});
