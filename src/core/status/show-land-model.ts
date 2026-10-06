import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type ArchivedCapability, readArchivedChange } from '../report/archive-record.js';
import { readChangeDisclosures } from '../report/result-sections.js';
import { readCheckCommand } from '../spec/human-steps.js';
import { parseFrontmatter, parseSpecMdFromFolder } from '../spec/parser.js';
import { readDependencyState } from '../spec/stack-dependencies.js';
import { selectVcs } from '../vcs/select.js';
import type { VcsDiffStat } from '../vcs/vcs.js';
import { worktreeBranch } from '../vcs/worktree.js';
import { listChanges } from './change-locations.js';
import { readLastSync } from './last-sync.js';
import { buildLandGates } from './show-land-gates.js';
import type { LandDisclosure, LandHalt, LandView } from './show-land-types.js';
import type { SpecDetails } from './show-types.js';

/** The proposal's change-level verify and declared check command. */
async function readProposalCommands(
  folderPath: string,
): Promise<{ verify: string; check: string | null }> {
  const spec = await parseSpecMdFromFolder(folderPath).catch(() => null);
  if (spec === null) return { verify: '', check: null };
  return { verify: spec.verify, check: readCheckCommand(parseFrontmatter(spec.raw).data) };
}

/** The archived change's delta capabilities, or none when it is not located. */
async function readCapabilities(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
): Promise<readonly ArchivedCapability[]> {
  const changes = await listChanges(projectRoot, config, ['archived']);
  const target = path.resolve(folderPath);
  const located = changes.find((change) => path.resolve(change.folderPath) === target);
  if (located === undefined) return [];
  return (await readArchivedChange(located)).capabilities;
}

/** Each task with a real deviated or outside-scope section. */
async function readDisclosures(folderPath: string): Promise<LandDisclosure[]> {
  const tasks = await readChangeDisclosures(folderPath);
  return tasks
    .filter((task) => task.deviated !== null || task.outsideScope !== null)
    .map((task) => ({
      task: task.task,
      deviated: task.deviated,
      outsideScope: task.outsideScope,
    }));
}

/** The change-level halt marker, or null when absent. */
async function readHalt(folderPath: string): Promise<LandHalt | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'regressed', 'change.md'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  const { data, body } = parseFrontmatter(content);
  const reason =
    typeof data.reason === 'string' && data.reason.trim() !== '' ? data.reason.trim() : null;
  return { reason, message: body.trim() };
}

interface GitFields {
  readonly landed: boolean | null;
  readonly defaultBranch: string | null;
  readonly mainCommits: number | null;
  readonly diff: VcsDiffStat | null;
}

/** The git-derived land facts, all null when the port says git is off. */
async function readGitFields(
  projectRoot: string,
  config: OsqConfig,
  folderName: string,
): Promise<GitFields> {
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') {
    return { landed: null, defaultBranch: null, mainCommits: null, diff: null };
  }
  const defaultBranch = await vcs.defaultBranch();
  const dependency = await readDependencyState(projectRoot, config, vcs, folderName);
  const landed = dependency.state === 'landed';
  const branch = worktreeBranch(folderName);
  const branchExists = (await vcs.listBranches(branch)).includes(branch);
  const mainCommits =
    !landed && branchExists ? await vcs.countCommits(branch, defaultBranch) : null;
  const diff = branchExists
    ? await vcs.diffStat(defaultBranch, branch, [config.paths.openspecRoot])
    : null;
  return { landed, defaultBranch, mainCommits, diff };
}

/**
 * The land view of an archived change: its archive gates, diff, spec changes,
 * disclosures, landed state, default-branch movement and halt, built from files
 * and refs osq already writes. Null for every other change. It writes nothing.
 */
export async function readLandView(
  projectRoot: string,
  details: SpecDetails,
  config: OsqConfig,
): Promise<LandView | null> {
  if (details.location !== 'archived') return null;
  const folderName = details.folderName;
  const [commands, capabilities, disclosures, halt, sync, git] = await Promise.all([
    readProposalCommands(details.folderPath),
    readCapabilities(projectRoot, config, details.folderPath),
    readDisclosures(details.folderPath),
    readHalt(details.folderPath),
    readLastSync(details.folderPath),
    readGitFields(projectRoot, config, folderName),
  ]);
  return {
    folderName,
    landed: git.landed,
    defaultBranch: git.defaultBranch,
    mainCommits: git.mainCommits,
    gates: buildLandGates(details.timeline, commands.verify, commands.check),
    diff: git.diff,
    capabilities,
    disclosures,
    halt,
    lastSync: sync.lastSync ?? null,
    lastSyncStop: sync.lastSyncStop ?? null,
  };
}
