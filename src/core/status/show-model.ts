import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { readPlanningSessions } from '../report/planning.js';
import { buildApprovalDigest } from '../spec/digest.js';
import { parseHumanSteps } from '../spec/human-steps.js';
import { extractSection, parseFrontmatter, parseSpecMdFromFolder } from '../spec/parser.js';
import { readNextStep } from './next-step.js';
import {
  buildRecertifications,
  buildVerificationHistory,
  readEventStreams,
} from './show-model-events.js';
import { resolveSpecFolder } from './show-model-folder.js';
import { attachTaskScenarios, readTaskDetails } from './show-model-tasks.js';
import type { PlanningSessionDetail, SpecDetails, TaskDetail } from './show-types.js';
import { type SpecStatus, deriveSpecState } from './state.js';

export { resolveSpecFolder } from './show-model-folder.js';

export async function getSpecDetails(
  projectRoot: string,
  specIdOrPrefix: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<SpecDetails> {
  const { folderPath, location } = await resolveSpecFolder(projectRoot, specIdOrPrefix, config);
  const details = await buildSpecDetails(projectRoot, folderPath, location, config);
  return withNextStep(projectRoot, folderPath, location, details, config);
}

/**
 * The proposal's `### After landing` steps, or an empty string when the folder
 * has no proposal or no such steps.
 */
async function readAfterLanding(folderPath: string): Promise<string> {
  const specData = await parseSpecMdFromFolder(folderPath).catch(() => null);
  if (!specData) return '';
  return parseHumanSteps(parseFrontmatter(specData.raw).body).afterLanding;
}

/**
 * Attach the change's next step and after-landing notes for active and archived
 * folders, and its verification history for an archived folder whose events
 * hold at least one verification row. A rejected folder is returned unchanged,
 * so no next step or notes are invented for it.
 */
async function withNextStep(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  details: SpecDetails,
  config: OsqConfig,
): Promise<SpecDetails> {
  if (location === 'rejected') return details;

  const next = await readNextStep(projectRoot, folderPath, config);
  const afterLanding = await readAfterLanding(folderPath);
  const base: SpecDetails = {
    ...details,
    next,
    ...(afterLanding ? { afterLanding } : {}),
  };
  if (location !== 'archived') return base;

  const verification = buildVerificationHistory(details.timeline);
  if (verification.checks.length === 0 && verification.outcomes.length === 0) return base;
  return { ...base, verification };
}

/** Capability writes are declared solely by delta spec folders under `specs/`. */
async function readWrittenCapabilities(folderPath: string): Promise<string[]> {
  const deltasDir = path.join(folderPath, 'specs');
  return (await fs.readdir(deltasDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The trimmed `.run/approved` seal, or null when absent or empty. */
async function readApprovedHash(runDir: string): Promise<string | null> {
  try {
    const hashContent = await fs.readFile(path.join(runDir, 'approved'), 'utf8');
    return hashContent.trim() || null;
  } catch {
    return null;
  }
}

/** Correlated planning lifecycle pairs in start order. */
async function readPlanningSessionDetails(folderPath: string): Promise<PlanningSessionDetail[]> {
  return (await readPlanningSessions(folderPath)).flatMap((session) => {
    const started = session.started;
    if (!started) return [];
    return [
      {
        sessionId: session.sessionId,
        startTime: started.timestamp,
        harness: started.data.harness,
        model: started.data.model,
        ...(started.data.agent ? { agent: started.data.agent } : {}),
        exitCode: session.exited?.data.exitCode ?? null,
        wallSeconds: session.exited?.data.wallSeconds ?? null,
      },
    ];
  });
}

interface StatusInput {
  isArchived: boolean;
  approvedHash: string | null;
  tasks: readonly TaskDetail[];
  projectRoot: string;
  folderPath: string;
}

/** Derive the spec status from the archive, seal, markers and spec state. */
async function deriveSpecStatus(input: StatusInput): Promise<SpecStatus> {
  if (input.isArchived) return 'done';
  if (!input.approvedHash) return 'unapproved';
  if (input.tasks.some((t) => t.status === 'regressed')) return 'regressed';
  if (input.tasks.some((t) => t.status === 'dead')) return 'dead';
  if (input.tasks.some((t) => t.status === 'running')) return 'running';
  if (input.tasks.length > 0 && input.tasks.every((t) => t.status === 'done')) return 'done';
  try {
    const derived = await deriveSpecState(input.projectRoot, input.folderPath);
    return derived.status;
  } catch {
    return 'pending';
  }
}

/**
 * Builds the complete change detail for an already resolved folder in any of
 * the three canonical locations. Selector discovery stays with the caller.
 */
export async function getSpecDetailsFromFolder(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<SpecDetails> {
  return buildSpecDetails(projectRoot, folderPath, location, config);
}

async function buildSpecDetails(
  projectRoot: string,
  folderPath: string,
  location: 'active' | 'archived' | 'rejected',
  config: OsqConfig,
): Promise<SpecDetails> {
  const isArchived = location === 'archived';

  const folderName = path.basename(folderPath);
  const idMatch = folderName.match(/^(\d+)/);
  const id = idMatch ? idMatch[1] : folderName;

  const specData = await parseSpecMdFromFolder(folderPath);
  if (!specData) {
    throw new Error(`Neither proposal.md nor spec.md found in ${folderPath}`);
  }

  const writtenCapabilities = await readWrittenCapabilities(folderPath);
  const runDir = path.join(folderPath, '.run');
  const approvedHash = await readApprovedHash(runDir);

  const planningSessions = await readPlanningSessionDetails(folderPath);
  const { timeline, taskEventsMap, recertificationEvents } = await readEventStreams(runDir);
  const recertifications = buildRecertifications(recertificationEvents);
  const tasks = await readTaskDetails(folderPath, runDir, taskEventsMap);
  const taskDetails = await attachTaskScenarios(projectRoot, tasks, config);
  const status = await deriveSpecStatus({
    isArchived,
    approvedHash,
    tasks,
    projectRoot,
    folderPath,
  });

  const body = parseFrontmatter(specData.raw).body;
  const humanSteps = parseHumanSteps(body);
  const digest =
    approvedHash === null ? await buildApprovalDigest(projectRoot, folderPath, config) : null;

  return {
    id,
    folderName,
    folderPath,
    isArchived,
    location,
    title: specData.title,
    status,
    approvedHash,
    dependsOn: specData.dependsOn,
    features: { reads: specData.features.reads, writes: writtenCapabilities },
    goal: specData.goal,
    contract: specData.contract,
    nonGoals: specData.nonGoals,
    delta: specData.delta,
    surface: extractSection(body, 'Surface'),
    decisions: extractSection(body, 'Decisions'),
    beforeApproval: humanSteps.beforeApproval,
    digest,
    tasks: taskDetails,
    planningSessions,
    recertifications,
    timeline,
  };
}
