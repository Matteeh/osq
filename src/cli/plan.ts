import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findSpecFolder } from '../core/approve.js';
import { resolvePlannerSelection } from '../core/config-codex.js';
import { type OsqConfig, loadConfig } from '../core/config.js';
import { getChangesDir } from '../core/layout.js';
import { parseFrontmatter } from '../core/parser.js';
import { readPlanningUsage, recordPlanExited, recordPlanStarted } from '../core/planning.js';
import type { QueuePlanSelection } from '../core/queue.js';
import { formatRepositoryRecordBody, getRepositoryRecord } from '../core/report.js';
import { getHarnessAdapter } from '../harness/index.js';
import type { HarnessAdapter } from '../harness/types.js';
import {
  buildOpeningPrompt as buildBaseOpeningPrompt,
  createChange,
  createQueueChange,
  prepareQueueSelection,
  validatePlanModeOptions,
  writeBriefAndManifest,
} from './plan-queue.js';

export { formatBriefContent } from './plan-queue.js';

/** Exact heading of the fifth ordered planning-prompt section. */
export const REPOSITORY_RECORD_HEADING = "## This repository's record";

export interface OpeningPromptOptions {
  projectRoot: string;
  folderPath: string;
  specId: string;
  specTitle: string;
  briefContent: string;
  openspecRoot: string;
  dependencyPaths?: readonly string[];
  config?: OsqConfig;
  recordBody?: string;
}

/**
 * Compose the opening prompt with the repository record as the fifth ordered
 * section. The record body comes from the shared report derivation over the 20
 * most recent canonical archives, or from a caller-supplied preformatted body.
 */
export async function buildOpeningPrompt(options: OpeningPromptOptions): Promise<string> {
  const base = await buildBaseOpeningPrompt(options);
  const recordBody =
    options.recordBody ??
    formatRepositoryRecordBody(
      await getRepositoryRecord(
        options.projectRoot,
        options.config ?? (await loadConfig(options.projectRoot)),
      ),
    );
  return `${base}\n\n${REPOSITORY_RECORD_HEADING}\n\n${recordBody}`;
}

export async function readBriefInput(briefOption?: string): Promise<string> {
  if (briefOption === '-') {
    return new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }

  if (briefOption) {
    return await fs.readFile(briefOption, 'utf8');
  }

  const editor = process.env.VISUAL || process.env.EDITOR;
  if (editor) {
    const tempFile = path.join(os.tmpdir(), `osq-brief-${Date.now()}.md`);
    await fs.writeFile(
      tempFile,
      '# Feature Brief\n\nDescribe the goal, background, and requirements here.\n',
      'utf8',
    );
    try {
      const parts = editor.trim().split(/\s+/);
      const res = spawnSync(parts[0], [...parts.slice(1), tempFile], {
        stdio: 'inherit',
      });
      if (res.error || res.status !== 0) {
        throw new Error(`Editor ${editor} exited with code ${res.status}`);
      }
      return await fs.readFile(tempFile, 'utf8');
    } finally {
      await fs.rm(tempFile, { force: true }).catch(() => {});
    }
  }

  throw new Error('No brief provided. Specify --brief <file> or set $EDITOR.');
}

export interface PlanCommandOptions {
  brief?: string;
  print?: boolean;
  next?: boolean;
  replan?: boolean;
  cwd?: string;
  adapter?: HarnessAdapter;
}

export async function planCommand(
  nameOrId: string | undefined,
  options: PlanCommandOptions = {},
): Promise<void> {
  const name = (nameOrId ?? '').trim();
  validatePlanModeOptions(name, options);

  const cwd = options.cwd || process.cwd();
  const config = await loadConfig(cwd);
  const plannerSelection = resolvePlannerSelection(config);
  const changesDir = getChangesDir(config.paths.openspecRoot, cwd);

  let queueSelection: QueuePlanSelection | null = null;
  let folderPath: string | null = null;
  let specId: string | null = null;
  let isResumed = false;

  if (options.next) {
    const selection = await prepareQueueSelection(cwd, config, {
      replan: options.replan,
      print: options.print,
    });
    if (!selection) return;
    queueSelection = selection;
  } else {
    try {
      folderPath = await findSpecFolder(changesDir, name);
      const briefExists = await fs
        .stat(path.join(folderPath, 'brief.md'))
        .then(() => true)
        .catch(() => false);
      if (briefExists) {
        isResumed = true;
        const folderName = path.basename(folderPath);
        specId = folderName.match(/^(\d+)/)?.[1] || folderName;
      }
    } catch {}
  }

  if (queueSelection) {
    const created = await createQueueChange(
      cwd,
      config,
      options.print,
      queueSelection,
      plannerSelection.briefModel,
    );
    folderPath = created.folderPath;
    specId = created.specId;
  } else if (!isResumed) {
    const created = await createChange(cwd, options.print, name, {});
    folderPath = created.folderPath;
    specId = created.specId;
    const rawBrief = await readBriefInput(options.brief);
    await writeBriefAndManifest(cwd, config, folderPath, plannerSelection.briefModel, rawBrief);
  }

  if (!folderPath || !specId) {
    throw new Error('Failed to resolve change folder');
  }

  const briefPath = path.join(folderPath, 'brief.md');
  const briefContent = await fs.readFile(briefPath, 'utf8');

  let specTitle = name;
  try {
    const proposalContent = await fs.readFile(path.join(folderPath, 'proposal.md'), 'utf8');
    const parsed = parseFrontmatter(proposalContent);
    if (parsed.data.title) {
      specTitle = String(parsed.data.title);
    }
  } catch {}

  const openingPrompt = await buildOpeningPrompt({
    projectRoot: cwd,
    folderPath,
    specId,
    specTitle,
    briefContent,
    openspecRoot: config.paths.openspecRoot,
    dependencyPaths: queueSelection?.landedDependencies.map((dep) => dep.archivePath),
    config,
  });

  if (options.print) {
    process.stdout.write(`${openingPrompt}\n`);
    return;
  }

  const adapter = options.adapter || getHarnessAdapter(plannerSelection.harness);
  const started = await recordPlanStarted(folderPath, {
    harness: plannerSelection.harness,
    model: plannerSelection.model || plannerSelection.briefModel || 'default',
    ...(plannerSelection.agent ? { agent: plannerSelection.agent } : {}),
    briefPath,
  });

  // Timing brackets the child: the reader runs only after it has closed.
  let exitCode = 1;
  let spawnError: unknown;
  try {
    if (!adapter.spawnInteractive) {
      throw new Error(
        `Harness adapter for '${plannerSelection.harness}' does not support interactive sessions.`,
      );
    }
    exitCode = await adapter.spawnInteractive({
      prompt: openingPrompt,
      cwd,
      model: plannerSelection.model,
      agent: plannerSelection.agent,
    });
  } catch (error) {
    spawnError = error;
  }

  const endedAtMs = Date.now();
  const usage = await readPlanningUsage(adapter.readInteractiveUsage, {
    cwd,
    startedAt: started.timestamp,
    endedAt: new Date(endedAtMs).toISOString(),
  });
  await recordPlanExited(folderPath, {
    sessionId: started.sessionId,
    startedAtMs: started.startedAtMs,
    endedAtMs,
    exitCode,
    usage,
  });

  if (spawnError) throw spawnError;
  if (exitCode !== 0) process.exitCode = exitCode;
}
