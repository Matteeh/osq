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

describe('steering documentation', () => {
  it('README steering bullet', async () => {
    const readme = await readReadme();
    const gates = section(readme, '## Gates and permissions', '## Change folder');

    assert.match(gates, /\*\*Steering\.\*\*/, 'the bullet must be labeled Steering');
    const steeringStart = gates.indexOf('**Steering.**');
    const recert = gates.indexOf('**Scope recertification.**');
    assert.ok(recert >= 0, 'Gates and permissions must still hold **Scope recertification.**');
    assert.ok(
      steeringStart < recert,
      'the **Steering.** bullet must come before **Scope recertification.**',
    );

    const bullet = gates.slice(steeringStart, recert);
    for (const trigger of ['stuck', 'blocked', 'regression']) {
      assert.ok(bullet.includes(trigger), `the steering bullet must name the ${trigger} trigger`);
    }
    assert.ok(bullet.includes('osq plan <id>'), 'the steering bullet must name osq plan <id>');
    assert.ok(
      bullet.includes('osq approve <id>'),
      'the steering bullet must name osq approve <id>',
    );
    assert.match(
      bullet,
      /change's own folder/i,
      'the steering bullet must say the prompt goes into the change folder',
    );
    assert.match(bullet, /evidence/i, 'the steering bullet must say the marker is evidence');
    assert.match(bullet, /--session/, 'the steering bullet must name --session');
    assert.match(
      bullet,
      /watcher/i,
      'the steering bullet must say the watcher leaves the change alone',
    );
    assert.match(bullet, /done task/i, 'the steering bullet must say done tasks are kept');
    assert.match(
      bullet,
      /osq retry/,
      'the steering bullet must say each trigger retires as osq retry does',
    );
    assert.match(
      bullet,
      /first task that is not done/i,
      'the steering bullet must name the first task that is not done',
    );
  });

  it('the loop diagram shows the steering step before fix / triage', async () => {
    const readme = await readReadme();
    const loop = section(readme, '## The loop', '## Gates and permissions');
    const steer = loop.indexOf('steer when osq asks');
    const fix = loop.indexOf('fix / triage');

    assert.ok(steer >= 0, 'the loop diagram must show the steering step');
    assert.ok(fix >= 0, 'the loop diagram must keep the fix / triage step');
    assert.ok(steer < fix, 'the steering step must come before the fix / triage step');
    assert.match(
      loop,
      /osq plan <id> -> revise the plan -> osq approve <id>, the run continues/,
      'the steering step must name osq plan, revise the plan, osq approve, and the run continues',
    );
  });

  it('Stuck tasks says the inbox shows it needing steering and keeps the escape hatch', async () => {
    const readme = await readReadme();
    const gates = section(readme, '## Gates and permissions', '## Change folder');
    const stuckStart = gates.indexOf('**Stuck tasks.**');
    const recert = gates.indexOf('**Scope recertification.**');
    assert.ok(stuckStart >= 0, 'Gates and permissions must still hold a **Stuck tasks.** bullet');
    assert.ok(recert > stuckStart, 'the stuck bullet must come before **Scope recertification.**');

    const stuck = gates.slice(stuckStart, recert);
    assert.match(stuck, /needing steering/i, 'the stuck bullet must say it needs steering');
    assert.ok(stuck.includes('osq plan <id>'), 'the stuck bullet must name osq plan <id>');
    assert.match(stuck, /fingerprint/, 'the stuck bullet must keep the fingerprint');
    assert.ok(stuck.includes('osq --json'), 'the stuck bullet must keep osq --json');
    assert.match(stuck, /`?stuck`?/, 'the stuck bullet must keep the stuck field');
    assert.match(
      stuck,
      /osq retry <id> <n>/,
      'the stuck bullet must say osq retry still retries a stuck task',
    );
  });

  it('the Blocked paragraph asks you to steer with osq plan', async () => {
    const readme = await readReadme();
    const blocked = readme.indexOf('writes what it needs under `## Blocked`');
    assert.ok(blocked >= 0, 'README must describe the ## Blocked exit');

    const paragraph = readme.slice(blocked, blocked + 500);
    assert.match(paragraph, /inbox shows the stated need/, 'it must say the inbox shows the need');
    assert.match(
      paragraph,
      /steer with `osq plan <id>`/,
      'it must ask you to steer with osq plan <id>',
    );
  });

  it('the inbox Needs you bullet says a steering change shows once with its trigger', async () => {
    const readme = await readReadme();
    const inbox = section(readme, '### Human Attention Inbox', '### Planning');

    assert.match(inbox, /needs steering/i, 'the inbox must name the steering state');
    assert.ok(inbox.includes('osq plan <id>'), 'the steering inbox item must name osq plan <id>');
    assert.match(inbox, /trigger/i, 'the steering inbox item must name the trigger');
    assert.match(inbox, /reason/i, 'the steering inbox item must name the reason');
    assert.match(
      inbox,
      /`?steering: \{ trigger, reason \}`?/,
      'the osq --json item must carry steering: { trigger, reason }',
    );
    assert.match(inbox, /optional/i, 'the inbox section must call the stuck field optional');
  });

  it('CHANGELOG records the steering change under 128', async () => {
    const changelog = await fs.readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const entry = changelog.indexOf('(128)');
    assert.ok(entry >= 0, 'CHANGELOG.md must hold an entry ending (128)');
    const start = changelog.lastIndexOf('## [', entry);
    const nextRelease = changelog.indexOf('## [', entry);
    assert.ok(
      start >= 0 && nextRelease > entry,
      'the entry must sit in a section followed by a release',
    );
    const unreleased = changelog.slice(start, nextRelease);

    assert.match(unreleased, /\(128\)/, 'the entry must end (128)');
    assert.match(unreleased, /stuck, blocked, or regressed/i, 'it must name the three triggers');
    assert.match(unreleased, /osq plan <id>/, 'it must name osq plan <id>');
    assert.match(
      unreleased,
      /change's own folder/i,
      "it must say osq plan writes the prompt into the change's own folder",
    );
    assert.match(unreleased, /osq approve/, 'it must name osq approve');
    assert.match(
      unreleased,
      /first task that is not done/i,
      'it must say osq approve continues from the first task that is not done',
    );
  });
});
