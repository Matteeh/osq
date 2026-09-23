import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readReadme(): Promise<string> {
  const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
  // Collapse line wrapping so prose phrases match regardless of where they break.
  return raw.replace(/\s+/g, ' ');
}

function section(readme: string, heading: string, next: string): string {
  const start = readme.indexOf(heading);
  assert.ok(start >= 0, `README must contain ${heading}`);
  const end = readme.indexOf(next, start + heading.length);
  assert.ok(end >= 0, `README must contain ${next} after ${heading}`);
  return readme.slice(start, end);
}

describe('automatic retry documentation', () => {
  it('README names gates.autoRetries, stuck, fingerprint, and Automatic retries', async () => {
    const readme = await readReadme();

    assert.ok(readme.includes('gates.autoRetries'), 'README must name gates.autoRetries');
    assert.ok(readme.includes('stuck'), 'README must mention stuck');
    assert.ok(readme.includes('fingerprint'), 'README must mention fingerprint');
    assert.ok(readme.includes('Automatic retries'), 'README must mention Automatic retries');
  });

  it('Gates and permissions gains an Automatic retry bullet with its reasons, count, and prompt', async () => {
    const readme = await readReadme();
    const gates = section(readme, '## Gates and permissions', '## Change folder');

    assert.match(gates, /\*\*Automatic retry\.\*\*/, 'the bullet must be labeled Automatic retry');
    for (const reason of [
      'verify_red',
      'change_verify_red',
      'undeclared_test_change',
      'no_result',
      'crashed',
      'timeout',
    ]) {
      assert.ok(gates.includes(reason), `the bullet must name the ${reason} reason`);
    }
    assert.match(
      gates,
      /(wait|before a human|for you)/i,
      'the bullet must say other reasons wait for a human',
    );
    assert.ok(gates.includes('gates.autoRetries'), 'the bullet must name gates.autoRetries');
    assert.match(gates, /defaults? to 1\b/i, 'the bullet must state the default of 1');
    assert.match(
      gates,
      /manual `?osq retry`? grants one more/i,
      'the bullet must say a manual osq retry grants one more',
    );
    assert.match(gates, /`?0`? (turns|disables)/i, 'the bullet must say 0 turns it off');
    assert.match(
      gates,
      /(previous dead marker|dead marker.{0,40}prompt|prompt.{0,60}dead marker)/i,
      'the bullet must say each retry prompt carries the previous dead marker',
    );
  });

  it('explains the fingerprint and the stuck stop with the inbox and retry escape hatch', async () => {
    const readme = await readReadme();
    const gates = section(readme, '## Gates and permissions', '## Change folder');

    assert.match(gates, /fingerprint/, 'the gates section must explain the fingerprint');
    for (const ignored of ['timestamp', 'duration', 'PID', 'ANSI', 'path']) {
      assert.ok(
        new RegExp(ignored, 'i').test(gates),
        `the fingerprint explanation must name ignored ${ignored} details`,
      );
    }
    assert.match(gates, /inbox/i, 'the explanation must say the inbox shows the task as stuck');
    assert.ok(
      gates.includes('osq --json'),
      'the explanation must say osq --json shows the stuck field',
    );
    assert.match(
      gates,
      /osq retry/,
      'the explanation must say osq retry still retries a stuck task',
    );
  });

  it('dead reasons note the fingerprint and stuck frontmatter', async () => {
    const readme = await readReadme();
    const dead = section(readme, 'Dead reasons:', '## Harnesses');

    assert.match(dead, /`?fingerprint`?/, 'the dead-reasons paragraph must name the fingerprint');
    assert.match(dead, /`?stuck: true`?/, 'the dead-reasons paragraph must name stuck: true');
  });

  it('inbox section documents the optional stuck field on task-dead items', async () => {
    const readme = await readReadme();
    const inbox = section(readme, '### Human Attention Inbox', '### Planning');

    assert.match(inbox, /`?task-dead`?/, 'the inbox section must name task-dead items');
    assert.match(inbox, /`?stuck`?/, 'the inbox section must document the stuck field');
    assert.match(inbox, /optional/i, 'the inbox section must call the stuck field optional');
  });

  it('Metrics & Reporting mentions the Automatic retries section', async () => {
    const readme = await readReadme();
    const metrics = section(readme, '### Metrics & Reporting', '### Delivery Dashboard');

    assert.ok(
      metrics.includes('Automatic retries'),
      'metrics must name the Automatic retries section',
    );
  });
});
