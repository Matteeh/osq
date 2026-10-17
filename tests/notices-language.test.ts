import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import { buildApprovalDigest } from '../src/core/spec/digest.js';
import { buildApprovalNotices } from '../src/core/spec/notices.js';
import { createChange, createProject } from './planning-observed-helpers.js';

/** One task's number and scope declarations, as the notice rules read them. */
interface TaskSpec {
  readonly number: string;
  readonly scope: readonly string[];
}

/** A minimal fixture change: its tasks and the files they resolve against. */
interface ChangeSpec {
  readonly tasks: readonly TaskSpec[];
  readonly files: readonly string[];
}

function proposalContent(): string {
  return [
    '---',
    'title: Fixture Change',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Exercise the language gap notice.',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
    '## Surface',
    '',
    'None',
    '',
    '## Decisions',
    '',
    'None',
    '',
    '## Assumptions',
    '',
    'None',
    '',
    '## Contract',
    '',
    '### Requirement: Fixture',
    '',
    'The system SHALL work.',
    '',
    '## Delta',
    '',
    'Delta specs declare behavior.',
    '',
  ].join('\n');
}

function taskContent(task: TaskSpec): string {
  const lines = [
    '---',
    `title: Task ${task.number}`,
    'verify: node verify.cjs',
    'scope:',
    ...task.scope.map((entry) => `  - ${entry}`),
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] one',
  ];
  return `${lines.join('\n')}\n`;
}

describe('language gap notice', () => {
  let projectRoot: string;
  let counter = 0;

  beforeEach(async () => {
    projectRoot = await createProject();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function noticesFor(spec: ChangeSpec) {
    counter += 1;
    const change = await createChange(projectRoot, `Language Fixture ${counter}`);
    const folder = change.folderPath;
    await fs.rm(path.join(folder, 'tasks'), { recursive: true, force: true });
    await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folder, 'proposal.md'), proposalContent(), 'utf8');
    for (const task of spec.tasks) {
      await fs.writeFile(
        path.join(folder, 'tasks', `${task.number}.md`),
        taskContent(task),
        'utf8',
      );
    }
    for (const file of spec.files) {
      const full = path.join(projectRoot, file);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, '// fixture\n', 'utf8');
    }
    const config = defineConfig({});
    const digest = await buildApprovalDigest(projectRoot, folder, config);
    return buildApprovalNotices(projectRoot, folder, config, digest);
  }

  it('fires language_gap for a Rust file in scope', async () => {
    const notices = await noticesFor({
      tasks: [
        { number: '2', scope: ['crates/core/src/lib.rs'] },
        { number: '3', scope: ['crates/core/Cargo.toml'] },
      ],
      files: ['crates/core/src/lib.rs', 'crates/core/Cargo.toml'],
    });

    const gap = notices.notices.find((notice) => notice.id === 'language_gap');
    assert.ok(gap, JSON.stringify(notices.notices));
    assert.equal(gap.severity, 'amber');
    assert.equal(gap.label, 'gates miss a language');
    assert.equal(gap.detail, 'Rust in task 2, task 3: no denied-dependency gate');
  });

  it('fires no language_gap for TypeScript only', async () => {
    const notices = await noticesFor({
      tasks: [
        { number: '1', scope: ['src/one.ts'] },
        { number: '2', scope: ['package.json'] },
      ],
      files: ['src/one.ts', 'package.json'],
    });

    assert.equal(
      notices.notices.some((notice) => notice.id === 'language_gap'),
      false,
    );
  });
});
