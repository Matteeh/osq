// osq passes the pick through OSQ_MUTATE, OSQ_MUTATION_TESTS and OSQ_MUTATION_REPORT.
import os from 'node:os';
import path from 'node:path';

const tests = JSON.parse(process.env.OSQ_MUTATION_TESTS ?? '[]')
  .map((file) => `'${file}'`)
  .join(' ');
const report = process.env.OSQ_MUTATION_REPORT;

export default {
  testRunner: 'command',
  commandRunner: {
    command: `node --import tsx --import ./tests/git-test-env.ts --test ${tests}`,
  },
  mutate: JSON.parse(process.env.OSQ_MUTATE ?? '[]'),
  coverageAnalysis: 'off',
  reporters: ['json'],
  jsonReporter: { fileName: report },
  tempDirName: report
    ? path.join(path.dirname(report), 'stryker')
    : path.join(os.tmpdir(), 'osq-stryker'),
};
