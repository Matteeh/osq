#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);

let stdin = '';
let stdinClosed = true;
let stdinRead = false;

// `--version` is probed through execFile/spawn with stdin ignored, so only task
// runs read stdin; a synchronous read returns at once when stdin is /dev/null.
function readStdinOnce() {
  if (stdinRead) return;
  stdinRead = true;
  try {
    stdin = fs.readFileSync(0, 'utf8');
  } catch {
    stdinClosed = false;
  }
}

const recordPath = process.env.OSQ_FAKE_CLAUDE_RECORD;

function record(extra) {
  if (!recordPath) return;
  fs.writeFileSync(
    recordPath,
    JSON.stringify(
      {
        argv,
        cwd: process.cwd(),
        env: {
          OSQ_TASK_NUMBER: process.env.OSQ_TASK_NUMBER,
          OSQ_SPEC_FOLDER: process.env.OSQ_SPEC_FOLDER,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
        stdinLength: stdin.length,
        stdinClosed,
        ...extra,
      },
      null,
      2,
    ),
    'utf8',
  );
}

if (argv.includes('--version')) {
  record({ kind: 'version' });
  process.stdout.write(`${process.env.OSQ_FAKE_CLAUDE_VERSION || '2.1.278 (Claude Code)'}\n`);
  process.exit(Number(process.env.OSQ_FAKE_CLAUDE_VERSION_CODE || 0));
}

readStdinOnce();
const mode = process.env.OSQ_FAKE_CLAUDE_MODE || 'success';
record({ kind: 'task', mode });

const stderr = process.env.OSQ_FAKE_CLAUDE_STDERR;
if (stderr) {
  process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
}

const jsonlPath = process.env.OSQ_FAKE_CLAUDE_JSONL;
if (jsonlPath && fs.existsSync(jsonlPath)) {
  process.stdout.write(fs.readFileSync(jsonlPath, 'utf8'));
}

const taskNumber = process.env.OSQ_TASK_NUMBER;
const specFolder = process.env.OSQ_SPEC_FOLDER;
if (process.env.OSQ_FAKE_CLAUDE_RESULT_TEXT && taskNumber && specFolder) {
  const resultsDir = path.join(specFolder, '.run', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, `${taskNumber}.md`),
    process.env.OSQ_FAKE_CLAUDE_RESULT_TEXT,
  );
}

process.exit(Number(process.env.OSQ_FAKE_CLAUDE_EXIT || 0));
