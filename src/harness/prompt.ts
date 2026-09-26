import fsSync from 'node:fs';
import path from 'node:path';
import { EXECUTOR_EXIT_LINES, EXECUTOR_STEPS } from '../core/foundation/init-blocks.js';
import { parseSpecMd } from '../core/spec/parser.js';
import {
  type SpawnTaskOptions,
  capabilityRuleLines,
  priorContextLines,
  resolveCapabilityRules,
} from './types.js';

/** Delta spec paths written by the change, in deterministic capability order. */
export function deltaSpecPaths(options: SpawnTaskOptions): string[] {
  const { projectRoot, specFolderPath } = options;
  const dir = path.join(specFolderPath, 'specs');
  let entries: fsSync.Dirent[];
  try {
    entries = fsSync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => path.relative(projectRoot, path.join(dir, name, 'spec.md')));
}

/**
 * Reads the `features.reads` names from `proposal.md`. A missing or malformed
 * proposal contributes no reads, exactly as the previous async loader did.
 */
function proposalReads(specFolderPath: string): string[] {
  let content: string;
  try {
    content = fsSync.readFileSync(path.join(specFolderPath, 'proposal.md'), 'utf8');
  } catch {
    return [];
  }
  try {
    return parseSpecMd(content).features.reads;
  } catch {
    return [];
  }
}

/**
 * Living capability specs referenced by the parent change: the reads declared by
 * the proposal plus the capabilities written by the change's delta specs.
 */
export function livingSpecPaths(options: SpawnTaskOptions): string[] {
  const { projectRoot, specFolderPath, config } = options;
  const names = new Set<string>();
  for (const name of proposalReads(specFolderPath)) {
    if (name.trim()) names.add(name.trim());
  }
  for (const delta of deltaSpecPaths(options)) {
    const parts = delta.split(path.sep);
    if (parts.length >= 2) names.add(parts[parts.length - 2]);
  }

  const featuresDir = config?.paths?.features || 'openspec/specs';
  const paths: string[] = [];
  for (const name of [...names].sort()) {
    const relative = path.join(featuresDir, name, 'spec.md');
    if (fsSync.existsSync(path.resolve(projectRoot, relative))) paths.push(relative);
  }
  return paths;
}

/** Full one-attempt executor prompt naming every file the task needs. */
export function buildExecutorPrompt(options: SpawnTaskOptions): string {
  const { projectRoot, specFolderPath, taskNumber, taskTitle, scope, entry, verifyCommand } =
    options;
  const taskRel = path.relative(
    projectRoot,
    path.resolve(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRel = path.relative(projectRoot, path.resolve(specFolderPath, 'proposal.md'));
  const resultAbs = path.resolve(specFolderPath, '.run', 'results', `${taskNumber}.md`);
  const resultRel = path.relative(projectRoot, resultAbs);
  const priorResult = fsSync.existsSync(resultAbs) ? resultRel : undefined;
  const deltas = deltaSpecPaths(options);
  const living = livingSpecPaths(options);

  return [
    'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
    `Task File: ${taskRel}`,
    `Parent Spec: ${specRel}`,
    `Task Title: ${taskTitle}`,
    `Scope: ${scope.join(', ')}`,
    `Entry: ${entry.join(', ')}`,
    `Verify Command: ${verifyCommand}`,
    `Result Destination: ${resultRel}`,
    ...priorContextLines({
      attempt: options.attempt,
      reason: options.priorFailureReason,
      output: options.priorFailureOutput,
      resultPath: priorResult,
    }),
    ...(deltas.length > 0 ? ['', 'Delta Specs:', ...deltas.map((p) => `- ${p}`)] : []),
    ...(living.length > 0 ? ['', 'Living Capability Specs:', ...living.map((p) => `- ${p}`)] : []),
    '',
    'Rules:',
    ...EXECUTOR_STEPS,
    ...capabilityRuleLines(resolveCapabilityRules(options)),
    '',
    'Exiting:',
    ...EXECUTOR_EXIT_LINES,
    '',
    `CRITICAL: Before exiting, you MUST write ${resultRel} as the Exiting rules above describe. Change no file outside Scope except that result file. Never run git.`,
  ].join('\n');
}
