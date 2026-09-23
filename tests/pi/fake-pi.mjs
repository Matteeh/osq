#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);

let stdin = '';
let stdinClosed = true;
let stdinRead = false;

// Only task runs read stdin; `--version` and `auth check` are probed through
// execFile, whose stdin pipe stays open and would block a synchronous read.
function readStdinOnce() {
  if (stdinRead) return;
  stdinRead = true;
  try {
    stdin = fs.readFileSync(0, 'utf8');
  } catch {
    stdinClosed = false;
  }
}

const recordPath = process.env.OSQ_FAKE_RECORD;

function record(extra) {
  if (!recordPath) return;
  fs.writeFileSync(
    recordPath,
    JSON.stringify(
      {
        argv,
        cwd: process.cwd(),
        taskNumber: process.env.OSQ_TASK_NUMBER,
        specFolder: process.env.OSQ_SPEC_FOLDER,
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
  process.stdout.write(`${process.env.OSQ_FAKE_PI_VERSION || '0.87.0'}\n`);
  process.exit(Number(process.env.OSQ_FAKE_PI_VERSION_CODE || 0));
}

if (argv[0] === 'auth' && argv[1] === 'check') {
  record({ kind: 'auth' });
  const providerIndex = argv.indexOf('--provider');
  const provider = providerIndex === -1 ? 'unknown' : argv[providerIndex + 1];
  const status = process.env.OSQ_FAKE_PI_AUTH_STATUS || 'ready';
  const reason = process.env.OSQ_FAKE_PI_AUTH_REASON || 'credentials_not_configured';
  process.stdout.write(`${JSON.stringify({ status, provider, reason })}\n`);
  process.exit(status === 'ready' ? 0 : 1);
}

const mode = process.env.OSQ_FAKE_PI_MODE || 'success';
readStdinOnce();
record({ kind: 'task', mode });

if (mode === 'fail') {
  process.stderr.write(`${process.env.OSQ_FAKE_PI_STDERR || 'fake pi failed'}\n`);
  process.exit(Number(process.env.OSQ_FAKE_PI_EXIT || 1));
}

if (mode === 'missing-credentials') {
  process.stdout.write(
    `${JSON.stringify({ type: 'session', version: 3, id: 'missing', timestamp: new Date(0).toISOString() })}\n`,
  );
  process.stderr.write('No API key found for the selected model.\n');
  process.exit(1);
}

const jsonlPath = process.env.OSQ_FAKE_PI_JSONL;
if (jsonlPath && fs.existsSync(jsonlPath)) {
  const content = fs.readFileSync(jsonlPath, 'utf8');
  const third = Math.floor(content.length / 3);
  for (const chunk of [
    content.slice(0, third),
    content.slice(third, third * 2),
    content.slice(third * 2),
  ]) {
    if (chunk) process.stdout.write(chunk);
  }
}

const taskNumber = process.env.OSQ_TASK_NUMBER;
const specFolder = process.env.OSQ_SPEC_FOLDER;
if (process.env.OSQ_FAKE_PI_RESULT_TEXT && taskNumber && specFolder) {
  const resultsDir = path.join(specFolder, '.run', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `${taskNumber}.md`), process.env.OSQ_FAKE_PI_RESULT_TEXT);
}

if (mode === 'hang' || mode === 'settle-hang') {
  setInterval(() => {}, 1000);
} else {
  process.exit(Number(process.env.OSQ_FAKE_PI_EXIT || 0));
}
