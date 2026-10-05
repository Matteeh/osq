import fs from 'node:fs/promises';
import path from 'node:path';
import { type ValidatorConfig, validatorRunConfig } from '../core/foundation/config-validator.js';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { selectVcs } from '../core/vcs/select.js';
import type { Vcs } from '../core/vcs/vcs.js';
import { getHarnessAdapter } from '../harness/index.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  type ValidatorFinding,
  type ValidatorOutcome,
  type ValidatorRanEventData,
  appendHarnessEvent,
} from '../harness/types.js';
import { parseValidatorFindings } from './validator-findings.js';
import { restoreValidatorTree, snapshotValidatorTree } from './validator-guard.js';
import {
  type ValidatorInputs,
  formatScenariosFile,
  readValidatorInputs,
} from './validator-inputs.js';
import { buildValidatorPrompt } from './validator-prompt.js';

const MAX_OUTPUT = 2000;

export interface RunValidatorOptions {
  readonly adapter?: HarnessAdapter;
  readonly logger?: Logger;
}
interface OutcomeFields {
  readonly outcome: ValidatorOutcome;
  readonly findings: readonly ValidatorFinding[];
  readonly exitCode: number | null;
  readonly output?: string;
}

function cut(text: string): string {
  return text.length <= MAX_OUTPUT ? text : text.slice(text.length - MAX_OUTPUT);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function record(specFolderPath: string, data: ValidatorRanEventData): Promise<void> {
  await appendHarnessEvent(specFolderPath, 'change', {
    type: 'validator_ran',
    timestamp: new Date().toISOString(),
    data,
  });
}

async function writeInputs(validatorDir: string, inputs: ValidatorInputs): Promise<void> {
  await fs.mkdir(validatorDir, { recursive: true });
  await fs.rm(path.join(validatorDir, 'findings.json'), { force: true });
  await fs.writeFile(path.join(validatorDir, 'diff.patch'), inputs.patch, 'utf8');
  await fs.writeFile(
    path.join(validatorDir, 'scenarios.md'),
    formatScenariosFile(inputs.scenarios),
    'utf8',
  );
}

function optionsFor(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
  validator: ValidatorConfig,
  inputs: ValidatorInputs,
  logger?: Logger,
): SpawnTaskOptions {
  const changeFolder = path.relative(projectRoot, specFolderPath).split(path.sep).join('/');
  const dir = `${changeFolder}/.run/validator`;
  return {
    projectRoot,
    specFolderPath,
    taskNumber: 'validator',
    taskTitle: 'Change validator',
    verifyCommand: '',
    scope: [],
    entry: [],
    skills: [],
    tier: 'smart',
    timeoutSeconds: validator.timeoutSeconds,
    config: validatorRunConfig(config, validator),
    ...(logger !== undefined ? { logger } : {}),
    prompt: buildValidatorPrompt(inputs, {
      changeFolder,
      scenariosFile: `${dir}/scenarios.md`,
      patchFile: `${dir}/diff.patch`,
      findingsFile: `${dir}/findings.json`,
    }),
  };
}

async function findingsText(validatorDir: string): Promise<string | null> {
  return fs.readFile(path.join(validatorDir, 'findings.json'), 'utf8').catch(() => null);
}

function resolveOutcome(
  result: SpawnResult | null,
  thrown: string | null,
  text: string | null,
): OutcomeFields {
  if (thrown !== null) {
    return {
      outcome: 'failed',
      findings: [],
      exitCode: result?.exitCode ?? null,
      output: cut(thrown),
    };
  }
  const spawn = result as SpawnResult;
  if (spawn.timedOut === true) {
    return { outcome: 'timed_out', findings: [], exitCode: spawn.exitCode };
  }
  if (spawn.exitCode !== 0) {
    return {
      outcome: 'failed',
      findings: [],
      exitCode: spawn.exitCode,
      output: cut(spawn.error ?? ''),
    };
  }
  const parsed = text === null ? null : parseValidatorFindings(text);
  if (parsed === null) {
    return {
      outcome: 'unreadable',
      findings: [],
      exitCode: spawn.exitCode,
      output: cut(text ?? ''),
    };
  }
  return { outcome: 'validated', findings: parsed, exitCode: spawn.exitCode };
}

function runEvent(
  validator: ValidatorConfig,
  scenarios: number,
  fields: OutcomeFields,
  duration: number,
  restored: readonly string[],
): ValidatorRanEventData {
  return {
    outcome: fields.outcome,
    harness: validator.harness,
    model: validator.model,
    duration,
    exitCode: fields.exitCode,
    scenarios,
    findings: fields.outcome === 'validated' ? [...fields.findings] : [],
    restored: [...restored],
    ...(fields.output !== undefined ? { output: fields.output } : {}),
  };
}

function failureEvent(validator: ValidatorConfig, text: string): ValidatorRanEventData {
  return {
    outcome: 'failed',
    harness: validator.harness,
    model: validator.model,
    duration: 0,
    exitCode: null,
    scenarios: 0,
    findings: [],
    restored: [],
    output: cut(text),
  };
}

async function runAndRecord(
  projectRoot: string,
  specFolderPath: string,
  validatorDir: string,
  vcs: Vcs,
  config: OsqConfig,
  validator: ValidatorConfig,
  inputs: ValidatorInputs,
  options: RunValidatorOptions,
): Promise<void> {
  const adapter = options.adapter ?? getHarnessAdapter(validator.harness);
  const snapshot = await snapshotValidatorTree(projectRoot, vcs);
  const started = Date.now();
  let result: SpawnResult | null = null;
  let thrown: string | null = null;
  try {
    result = await adapter.spawn(
      optionsFor(projectRoot, specFolderPath, config, validator, inputs, options.logger),
    );
  } catch (error) {
    thrown = message(error);
  }
  const duration = Math.max(0, (Date.now() - started) / 1000);
  const restored = await restoreValidatorTree(projectRoot, specFolderPath, vcs, snapshot);
  const fields = resolveOutcome(result, thrown, await findingsText(validatorDir));
  await record(
    specFolderPath,
    runEvent(validator, inputs.scenarios.length, fields, duration, restored),
  );
}

export async function runValidator(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
  options: RunValidatorOptions = {},
): Promise<void> {
  const validator = config.validator;
  if (validator === undefined || !validator.enabled) return;
  const validatorDir = path.join(specFolderPath, '.run', 'validator');
  try {
    const vcs = await selectVcs(projectRoot, config);
    const inputs = await readValidatorInputs(projectRoot, specFolderPath, vcs, config);
    if ('notRun' in inputs) {
      await record(specFolderPath, {
        outcome: 'not_run',
        harness: validator.harness,
        model: validator.model,
        duration: 0,
        exitCode: null,
        scenarios: 0,
        findings: [],
        restored: [],
        reason: inputs.notRun,
      });
      return;
    }
    await writeInputs(validatorDir, inputs);
    await runAndRecord(
      projectRoot,
      specFolderPath,
      validatorDir,
      vcs,
      config,
      validator,
      inputs,
      options,
    );
  } catch (error) {
    const text = message(error);
    options.logger?.warn(`validator failed: ${text}`);
    await record(specFolderPath, failureEvent(validator, text)).catch(() => undefined);
  } finally {
    await fs.rm(validatorDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
