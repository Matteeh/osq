import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import { type RetryContext, readRetryContext } from '../src/watcher/attempt.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;
const RED = '\u001b[31m';
const RESET = '\u001b[0m';

interface Fixture {
  readonly tmpDir: string;
  readonly specFolder: string;
}

async function setup(): Promise<Fixture> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-retry-prior-output-'));
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  const spec = await createNewSpec(tmpDir, 'Retry Prior Output');
  const specFolder = spec.folderPath;
  await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:\s*.*$/m, `verify: ${VERIFY}`),
    'utf8',
  );
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a dead task is retried, the next prompt carries its body',
    `verify: ${VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  return { tmpDir, specFolder };
}

async function writeDeadMarker(specFolder: string, body: string): Promise<void> {
  const deadDir = path.join(specFolder, '.run', 'dead');
  await fs.mkdir(deadDir, { recursive: true });
  await fs.writeFile(path.join(deadDir, '1.md'), `---\nreason: verify_red\n---\n${body}`, 'utf8');
}

function promptFor(fixture: Fixture, context: RetryContext): string {
  return buildExecutorPrompt({
    projectRoot: fixture.tmpDir,
    specFolderPath: fixture.specFolder,
    taskNumber: '1',
    taskTitle: 'When a dead task is retried, the next prompt carries its body',
    verifyCommand: VERIFY,
    scope: [],
    entry: [],
    skills: [],
    tier: 'coding',
    attempt: context.attempt,
    ...(context.reason ? { priorFailureReason: context.reason } : {}),
    ...(context.output ? { priorFailureOutput: context.output } : {}),
  });
}

describe('retry prior output', () => {
  it('renders the retained marker body, ANSI-stripped, after a manual retry', async () => {
    const fixture = await setup();
    await writeDeadMarker(fixture.specFolder, `before ${RED}red${RESET} after\n`);

    await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);
    const context = await readRetryContext(fixture.specFolder, '1');
    assert.equal(context.output, 'before red after\n');

    const prompt = promptFor(fixture, context);
    assert.ok(prompt.includes('Prior Context:'));
    assert.ok(prompt.includes('before red after'));
    assert.ok(!prompt.includes(RED), 'ANSI codes never reach the prompt');
  });

  it('renders the retained marker body after an automatic retry', async () => {
    const fixture = await setup();
    await writeDeadMarker(fixture.specFolder, `before ${RED}red${RESET} after\n`);

    await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG, { automatic: true });
    const context = await readRetryContext(fixture.specFolder, '1');
    assert.equal(context.output, 'before red after\n');

    const prompt = promptFor(fixture, context);
    assert.ok(prompt.includes('before red after'));
    assert.ok(!prompt.includes(RED), 'ANSI codes never reach the prompt');
  });

  it('bounds a large retained body at the existing prior-context limit', async () => {
    const fixture = await setup();
    await writeDeadMarker(fixture.specFolder, `${'A'.repeat(5000)}\n`);

    await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);
    const context = await readRetryContext(fixture.specFolder, '1');
    assert.equal(context.output?.length, 5001);

    const prompt = promptFor(fixture, context);
    assert.ok(prompt.includes(`${'A'.repeat(2000)}…`), 'output is cut at 2,000 characters');
    assert.ok(!prompt.includes('A'.repeat(2001)), 'no content beyond the bound is rendered');
  });
});
