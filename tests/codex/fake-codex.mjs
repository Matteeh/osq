#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const recordPath = process.env.OSQ_FAKE_RECORD;
if (recordPath) {
  fs.writeFileSync(
    recordPath,
    JSON.stringify(
      {
        argv,
        cwd: process.cwd(),
        taskNumber: process.env.OSQ_TASK_NUMBER,
        specFolder: process.env.OSQ_SPEC_FOLDER,
      },
      null,
      2,
    ),
    'utf8',
  );
}

if (argv.includes('--version')) {
  if (process.env.OSQ_FAKE_VERSION_HANG) {
    await new Promise(() => {});
  }
  process.stdout.write(`${process.env.OSQ_FAKE_VERSION || 'codex-cli 0.0.0-fake'}\n`);
  process.exit(Number(process.env.OSQ_FAKE_VERSION_CODE || 0));
}

const interactive = !argv.includes('exec');
if (interactive) {
  process.stdout.write(`${process.env.OSQ_FAKE_STDOUT || 'interactive-ready'}\n`);
  if (process.env.OSQ_FAKE_STDERR) {
    process.stderr.write(`${process.env.OSQ_FAKE_STDERR}\n`);
  }
  if (process.env.OSQ_FAKE_INTERACTIVE_SIGNAL) {
    process.kill(process.pid, process.env.OSQ_FAKE_INTERACTIVE_SIGNAL);
  }
  process.exit(Number(process.env.OSQ_FAKE_INTERACTIVE_EXIT || 0));
}

const mode = process.env.OSQ_FAKE_MODE || 'success';
if (mode === 'fail') {
  process.stderr.write(`${process.env.OSQ_FAKE_STDERR || 'fake codex failed'}\n`);
  process.exit(Number(process.env.OSQ_FAKE_EXIT || 17));
}
if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else {
  const jsonlPath = process.env.OSQ_FAKE_JSONL;
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
  if (mode === 'turn-failed') {
    process.stdout.write(
      `${JSON.stringify({ type: 'turn.failed', error: { message: 'codex turn exploded' } })}\n`,
    );
  }
  const taskNumber = process.env.OSQ_TASK_NUMBER;
  const specFolder = process.env.OSQ_SPEC_FOLDER;
  if (process.env.OSQ_FAKE_RESULT_TEXT && taskNumber && specFolder) {
    const resultsDir = path.join(specFolder, '.run', 'results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, `${taskNumber}.md`),
      process.env.OSQ_FAKE_RESULT_TEXT,
      'utf8',
    );
  }
  process.exit(Number(process.env.OSQ_FAKE_EXIT || 0));
}
