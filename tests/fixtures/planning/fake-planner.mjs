#!/usr/bin/env node
// Deterministic interactive planner stand-in. It ignores every harness's
// literal argv, delays for a known interval, and (when configured) writes the
// sanitized session artifact for the selected harness.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const delayMs = Number(process.env.OSQ_FAKE_DELAY_MS ?? '120');
const exitCode = Number(process.env.OSQ_FAKE_EXIT_CODE ?? '0');

function substitute(text, values) {
  return text.replace(/__([A-Z_]+)__/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

function renderFixture(fixturePath) {
  if (!fixturePath) return '';
  try {
    return fs.readFileSync(fixturePath, 'utf8');
  } catch {
    return '';
  }
}

// OpenCode's read-only `db --format json` query mode.
if (argv[0] === 'db') {
  const artifact = process.env.OSQ_OPENCODE_ARTIFACT;
  const body = artifact ? renderFixture(artifact) : '';
  process.stdout.write(body || JSON.stringify({ rows: [] }));
  process.exit(0);
}

const nowMs = Date.now();
const nowIso = new Date(nowMs).toISOString();
const cwd = process.cwd();

// Simulate the selected harness writing its session artifact while planning.
const opencodeArtifact = process.env.OSQ_OPENCODE_ARTIFACT;
if (opencodeArtifact) {
  const values = { CWD: cwd, NOW_MS: nowMs, NOW_ISO: nowIso };
  const rendered = substitute(renderFixture(process.env.OSQ_OPENCODE_FIXTURE), values);
  fs.mkdirSync(path.dirname(opencodeArtifact), { recursive: true });
  fs.writeFileSync(opencodeArtifact, rendered, 'utf8');
}

const rolloutDir = process.env.OSQ_CODEX_ROLLOUT_DIR;
if (rolloutDir) {
  const values = { CWD: cwd, NOW_MS: nowMs, NOW_ISO: nowIso };
  const rendered = substitute(renderFixture(process.env.OSQ_CODEX_ROLLOUT_FIXTURE), values);
  fs.mkdirSync(rolloutDir, { recursive: true });
  fs.writeFileSync(path.join(rolloutDir, `rollout-${nowMs}.jsonl`), rendered, 'utf8');
}

// Prove the start record is already on disk when the planner process opens.
const probeOut = process.env.OSQ_FAKE_PLAN_PROBE_OUT;
if (probeOut) {
  let count = 0;
  const changesDir = path.join(cwd, 'openspec', 'changes');
  try {
    for (const entry of fs.readdirSync(changesDir)) {
      const log = path.join(changesDir, entry, '.run', 'plan.jsonl');
      if (fs.existsSync(log)) {
        count += fs
          .readFileSync(log, 'utf8')
          .split('\n')
          .filter((line) => line.includes('"plan_started"')).length;
      }
    }
  } catch {
    count = 0;
  }
  fs.writeFileSync(probeOut, String(count), 'utf8');
}

setTimeout(() => process.exit(exitCode), delayMs);
