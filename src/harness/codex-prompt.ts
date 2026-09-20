import fsSync from 'node:fs';
import path from 'node:path';
import { resolveCodexEffort, resolveCodexModel } from '../core/config-codex.js';
import { parseSpecMdFromFolder } from '../core/parser.js';
import { type SpawnTaskOptions, capabilityRuleLines, resolveCapabilityRules } from './types.js';

function changeDocName(specFolderPath: string): string {
  return fsSync.existsSync(path.resolve(specFolderPath, 'proposal.md')) ? 'proposal.md' : 'spec.md';
}

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
 * Living capability specs referenced by the parent change: the reads declared by
 * the proposal plus the capabilities written by the change's delta specs.
 */
export async function livingSpecPaths(options: SpawnTaskOptions): Promise<string[]> {
  const { projectRoot, specFolderPath, config } = options;
  const names = new Set<string>();
  try {
    const spec = await parseSpecMdFromFolder(specFolderPath);
    for (const name of spec?.features.reads ?? []) {
      if (name.trim()) names.add(name.trim());
    }
  } catch {
    // A missing or malformed proposal simply contributes no reads.
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
export async function buildCodexPrompt(options: SpawnTaskOptions): Promise<string> {
  const { projectRoot, specFolderPath, taskNumber, taskTitle, scope, entry, verifyCommand } =
    options;
  const changeDoc = changeDocName(specFolderPath);
  const taskRel = path.relative(
    projectRoot,
    path.resolve(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRel = path.relative(projectRoot, path.resolve(specFolderPath, changeDoc));
  const resultRel = path.relative(
    projectRoot,
    path.resolve(specFolderPath, '.run', 'results', `${taskNumber}.md`),
  );
  const resultAbs = path.resolve(specFolderPath, '.run', 'results', `${taskNumber}.md`);
  const priorResult = fsSync.existsSync(resultAbs) ? resultRel : undefined;
  const deltas = deltaSpecPaths(options);
  const living = await livingSpecPaths(options);
  const capabilityRules = resolveCapabilityRules(options);

  return [
    'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
    `Task File: ${taskRel}`,
    `Parent Spec: ${specRel}`,
    `Task Title: ${taskTitle}`,
    `Scope: ${scope.join(', ')}`,
    `Entry: ${entry.join(', ')}`,
    `Verify Command: ${verifyCommand}`,
    `Result Destination: ${resultRel}`,
    ...(priorResult ? [`Prior Result: ${priorResult}`] : []),
    ...(deltas.length > 0 ? ['Delta Specs:', ...deltas.map((p) => `- ${p}`)] : []),
    ...(living.length > 0 ? ['Living Capability Specs:', ...living.map((p) => `- ${p}`)] : []),
    '',
    'Rules:',
    `1. Read ${taskRel}, ${specRel}, the named delta and living capability specs, and any prior result.`,
    '2. Write tests for each acceptance line before implementing.',
    '3. Keep all edits strictly inside scope.',
    `4. Run the task verify command first and start from what fails: ${verifyCommand}`,
    `5. CRITICAL: Before exiting, you MUST write ${resultRel} documenting: changed, deviated, drift against features/, missing context, and next steps.`,
    `6. Do not modify tasks.md, ${changeDoc}, or any file outside your scope and ${resultRel}.`,
    `7. When done, write ${resultRel} and exit cleanly.`,
    '',
    'Execution procedure (one attempt only): read any prior result, run the task verify command, write tests for each acceptance line, edit only files inside scope, write the result, then exit without asking questions.',
    ...capabilityRuleLines(capabilityRules),
  ].join('\n');
}

export interface CodexExecControls {
  readonly model?: string;
  readonly effort?: string;
}

/** Noninteractive `exec` argv, excluding the literal prompt argument. */
export function buildCodexExecArgs(controls: CodexExecControls = {}): string[] {
  const args: string[] = [
    '--ask-for-approval',
    'never',
    'exec',
    '--json',
    '--sandbox',
    'workspace-write',
    '-c',
    'web_search="disabled"',
    '-c',
    'sandbox_workspace_write.network_access=false',
  ];
  if (controls.model) args.push('--model', controls.model);
  if (controls.effort) args.push('-c', `model_reasoning_effort="${controls.effort}"`);
  return args;
}

/** Noninteractive task argv with the prompt as a single literal argument. */
export async function buildCodexArgs(options: SpawnTaskOptions): Promise<string[]> {
  const controls: CodexExecControls = {
    model: resolveCodexModel(options.config),
    effort: resolveCodexEffort(options.config),
  };
  return [...buildCodexExecArgs(controls), await buildCodexPrompt(options)];
}

/** Interactive terminal UI argv: on-request approvals, no exec/JSON/effort flags. */
export function buildCodexInteractiveArgs(options: {
  prompt: string;
  model?: string;
}): string[] {
  const args: string[] = ['--ask-for-approval', 'on-request', '--sandbox', 'workspace-write'];
  if (options.model) args.push('--model', options.model);
  args.push(options.prompt);
  return args;
}
