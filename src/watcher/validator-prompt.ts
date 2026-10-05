import type { ValidatorInputs } from './validator-inputs.js';

export interface ValidatorPromptPaths {
  /** All project-relative. */
  readonly changeFolder: string;
  readonly scenariosFile: string;
  readonly patchFile: string;
  readonly findingsFile: string;
}

/** One finding with every field, for the prompt's JSON example. */
const FINDING_EXAMPLE = JSON.stringify(
  {
    findings: [
      {
        kind: 'scenario',
        capability: '<capability>',
        requirement: '<requirement>',
        scenario: '<scenario>',
        problem: 'no_test',
        detail: '<one sentence>',
      },
    ],
  },
  null,
  2,
);

function bulletPaths(paths: readonly string[]): string[] {
  return paths.length > 0 ? paths.map((value) => `- ${value}`) : ['- (none)'];
}

/**
 * The validator's whole prompt. It names the change folder, the delta specs,
 * the scenarios file, the patch, the tests the change added or changed, and
 * the findings file; then the rules; then the executor results as claims; and
 * ends with the findings JSON shape and the critical write line.
 */
export function buildValidatorPrompt(inputs: ValidatorInputs, paths: ValidatorPromptPaths): string {
  const lines: string[] = [
    'You judge whether an osq change does what its delta specs say.',
    'You read code, tests, and specs but never edit them.',
    'You never run git and never run a build or test command.',
    '',
    `Change folder: ${paths.changeFolder}`,
    'Delta specs:',
    ...bulletPaths(inputs.deltaPaths),
    `Scenarios to judge: ${paths.scenariosFile}`,
    `Patch: ${paths.patchFile}`,
    'Tests the change added or changed:',
    ...bulletPaths(inputs.testPaths),
    `Findings file: ${paths.findingsFile}`,
    '',
    'Rules:',
    '- Judge only the scenarios listed in the scenarios file.',
    '- You may read any file in the repository, including tests the change did not touch.',
    '- Run no build or test command.',
    '- Report a finding only for one of these three problems:',
    '  - no_code: no code meets the scenario.',
    "  - no_test: no test checks the scenario's THEN.",
    '  - passes_without_change: the scenario describes behavior the base did not have, and its test would still pass on the base code.',
    '- Report nothing about style, naming, or architecture.',
    '',
    'Executor claims (check them; do not start from them):',
    ...bulletPaths(inputs.resultPaths),
    '',
    `Write ${paths.findingsFile} as JSON, one finding per entry, in this shape:`,
    FINDING_EXAMPLE,
    'Write {"findings": []} when every scenario holds.',
    '',
    `CRITICAL: Before exiting, write ${paths.findingsFile}. Change no other file. Never run git.`,
  ];
  return lines.join('\n');
}
