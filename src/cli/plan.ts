import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePlannerSelection } from '../core/foundation/config-codex.js';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { readPlanningUsage, recordPlanExited, recordPlanStarted } from '../core/report/planning.js';
import {
  RECENT_DISCLOSURES_HEADING,
  formatRecentDisclosures,
} from '../core/report/recent-disclosures.js';
import { formatRepositoryRecordBody, getRepositoryRecord } from '../core/report/report.js';
import { findSpecFolder } from '../core/spec/approve.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { getChangesDir } from '../core/status/layout.js';
import { formatNextStep, readNextStep } from '../core/status/next-step.js';
import type { QueuePlanSelection } from '../core/status/queue.js';
import { getHarnessAdapter } from '../harness/index.js';
import type { HarnessAdapter } from '../harness/types.js';
import {
  buildBaseOpeningPrompt,
  createChange,
  createQueueChange,
  prepareQueueSelection,
  readBriefInput,
  validatePlanModeOptions,
  writeBriefAndManifest,
  writePromptHandoff,
} from './plan-queue.js';

export { formatBriefContent } from './plan-queue.js';
export { readBriefInput };

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
 * A sixth section quotes recent executor disclosures when any exist.
 */
export async function buildOpeningPrompt(options: OpeningPromptOptions): Promise<string> {
  const base = await buildBaseOpeningPrompt(options);
  const config = options.config ?? (await loadConfig(options.projectRoot));
  const recordBody =
    options.recordBody ??
    formatRepositoryRecordBody(await getRepositoryRecord(options.projectRoot, config));
  let prompt = `${base}\n\n${REPOSITORY_RECORD_HEADING}\n\n${recordBody}`;

  const disclosures = await formatRecentDisclosures(options.projectRoot, config);
  if (disclosures !== null) {
    prompt += `\n\n${RECENT_DISCLOSURES_HEADING}\n\n${disclosures}`;
  }
  return prompt;
}

export interface PlanCommandOptions {
  brief?: string;
  print?: boolean;
  session?: boolean;
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
  const changesDir = getChangesDir(config.paths.openspecRoot, cwd);

  // The planner is resolved only for an explicit owned session; the default
  // prompt handoff and print modes never need planner configuration.
  const isSession = options.session === true;
  const plannerSelection = isSession ? resolvePlannerSelection(config) : null;
  const briefModel = plannerSelection?.briefModel ?? null;
  const quiet = !isSession;

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
    const created = await createQueueChange(cwd, config, quiet, queueSelection, briefModel);
    folderPath = created.folderPath;
    specId = created.specId;
  } else if (!isResumed) {
    const created = await createChange(cwd, quiet, name, {});
    folderPath = created.folderPath;
    specId = created.specId;
    const rawBrief = await readBriefInput(options.brief);
    await writeBriefAndManifest(cwd, config, folderPath, briefModel, rawBrief);
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

  if (!plannerSelection) {
    const nextStep = await readNextStep(cwd, folderPath, config);
    await writePromptHandoff(folderPath, openingPrompt, formatNextStep(nextStep));
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
