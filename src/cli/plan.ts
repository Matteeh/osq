import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePlannerSelection } from '../core/foundation/config-codex.js';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { HISTORY_HINTS_HEADING, formatPlanHintSections } from '../core/report/history-hints.js';
import { appendManualEditsSection } from '../core/report/manual-edits-section.js';
import { readPlanningUsage, recordPlanExited, recordPlanStarted } from '../core/report/planning.js';
import { RECENT_DISCLOSURES_HEADING } from '../core/report/recent-disclosures.js';
import { formatRepositoryRecordBody, getRepositoryRecord } from '../core/report/report.js';
import { findSpecFolder } from '../core/spec/approve.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { getChangesDir } from '../core/status/layout.js';
import { formatNextStep, readNextStep } from '../core/status/next-step.js';
import type { QueuePlanSelection } from '../core/status/queue.js';
import { getHarnessAdapter } from '../harness/index.js';
import type { HarnessAdapter } from '../harness/types.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, type Writer, resolveInputs } from './command-inputs.js';
import { refuseFinishedChange } from './plan-finished.js';
import { writePromptHandoff } from './plan-prompt-handoff.js';
import {
  buildBaseOpeningPrompt,
  createChange,
  createQueueChange,
  prepareQueueSelection,
  readBriefInput,
  validatePlanModeOptions,
  writeBriefAndManifest,
} from './plan-queue.js';
import { planRunCommand } from './plan-run.js';
import { readSteeringPlan } from './plan-steer.js';

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
 * section, then any counted history, recent executor disclosures and manual edits.
 * @scenario metrics-and-reporting: Section placement
 * @scenario metrics-and-reporting: Too little history
 * @scenario metrics-and-reporting: Manual edits in the plan prompt
 * @adr 008
 */
export async function buildOpeningPrompt(options: OpeningPromptOptions): Promise<string> {
  const config = options.config ?? (await loadConfig(options.projectRoot));
  const base = await buildBaseOpeningPrompt({ ...options, config });
  const recordBody =
    options.recordBody ??
    formatRepositoryRecordBody(await getRepositoryRecord(options.projectRoot, config));
  let prompt = `${base}\n\n${REPOSITORY_RECORD_HEADING}\n\n${recordBody}`;

  const { history, disclosures } = await formatPlanHintSections(options.projectRoot, config);
  if (history !== null) prompt += `\n\n${HISTORY_HINTS_HEADING}\n\n${history}`;
  if (disclosures !== null) prompt += `\n\n${RECENT_DISCLOSURES_HEADING}\n\n${disclosures}`;
  prompt = await appendManualEditsSection(prompt, options.projectRoot, config);
  return prompt;
}

export interface PlanCommandOptions extends CommandInputs {
  brief?: string;
  print?: boolean;
  session?: boolean;
  next?: boolean | string;
  replan?: boolean;
  adapter?: HarnessAdapter;
  run?: boolean;
  notes?: string;
  planRunRole?: 'worker';
  spawnPlanWorker?: (id: string, notes: string | undefined) => Promise<number>;
}

export async function planCommand(
  nameOrId: string | undefined,
  options: PlanCommandOptions = {},
): Promise<void> {
  if (options.run === true || options.notes !== undefined) {
    return planRunCommand(nameOrId, options);
  }
  const name = (nameOrId ?? '').trim();
  validatePlanModeOptions(name, options);
  const inputs = resolveInputs(options);
  const cwd = inputs.cwd;
  const config = await inputs.config();
  const changesDir = getChangesDir(config.paths.openspecRoot, cwd);

  const isSession = options.session === true;
  const plannerSelection = isSession ? resolvePlannerSelection(config) : null;
  const briefModel = plannerSelection?.briefModel ?? null;
  const createdOutput: Writer | null = isSession ? inputs.stdout : null;
  let queueSelection: QueuePlanSelection | null = null;
  let folderPath: string | null = null;
  let specId: string | null = null;
  let isResumed = false;
  let steeringSection: string | null = null;
  let planningCwd = cwd;

  if (options.next) {
    const selection = await prepareQueueSelection(
      cwd,
      config,
      { next: options.next, replan: options.replan, print: options.print },
      inputs.stderr,
    );
    if (!selection) return;
    queueSelection = selection;
  } else {
    const steering = await readSteeringPlan(cwd, config, name);
    if (steering) {
      folderPath = steering.change.folderPath;
      specId = steering.id;
      isResumed = true;
      steeringSection = steering.section;
      planningCwd = steering.change.tree.root;
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
  }

  if (queueSelection) {
    const created = await createQueueChange(cwd, config, createdOutput, queueSelection, briefModel);
    folderPath = created.folderPath;
    specId = created.specId;
  } else if (!isResumed) {
    await refuseFinishedChange(cwd, config, name);
    const created = await createChange(cwd, createdOutput, name, { config });
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

  const prompt = steeringSection ? `${openingPrompt}\n\n${steeringSection}` : openingPrompt;

  if (options.print) {
    inputs.stdout(`${prompt}\n`);
    return;
  }

  if (!plannerSelection) {
    const nextStep = await readNextStep(planningCwd, folderPath, config);
    await writePromptHandoff({
      folderPath,
      openingPrompt: prompt,
      nextStep: formatNextStep(nextStep),
      specId,
      cwd,
      changesDir,
      stdout: inputs.stdout,
    });
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
      prompt,
      cwd: planningCwd,
      model: plannerSelection.model,
      agent: plannerSelection.agent,
    });
  } catch (error) {
    spawnError = error;
  }

  const endedAtMs = Date.now();
  const usage = await readPlanningUsage(adapter.readInteractiveUsage, {
    cwd: planningCwd,
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
  if (exitCode !== 0) throw new CommandError('', { exitCode });
}
