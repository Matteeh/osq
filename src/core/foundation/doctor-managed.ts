import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from './config.js';
import {
  CLAUDE_PLAN_COMMAND_PATH,
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from './init-blocks.js';
import { type ManagedBlockProblem, inspectManagedBlock } from './init-managed.js';

export interface ManagedBlocksResult {
  ok: boolean;
  message: string;
}

interface ManagedFile {
  relPath: string;
  canonical: string;
}

/**
 * Every planning entry point osq manages. Codex reads `AGENTS.md`, the human
 * planner model reads `PLANNER.md`, and Claude Code expands the command below.
 */
const MANAGED_FILES: readonly ManagedFile[] = [
  { relPath: 'AGENTS.md', canonical: MANAGED_AGENTS_MD_BODY },
  { relPath: 'PLANNER.md', canonical: MANAGED_PLANNER_BLOCK },
  { relPath: CLAUDE_PLAN_COMMAND_PATH, canonical: MANAGED_CLAUDE_PLAN_COMMAND },
];

const PROBLEM_TEXT: Record<ManagedBlockProblem, string> = {
  'missing-block': 'is missing its managed block',
  partial: 'has a partial managed block',
  reversed: 'has a reversed managed block',
  duplicated: 'has duplicate managed blocks',
  stale: 'has a stale managed block',
};

/** Relative path of the executor agent file `osq setup` writes for opencode. */
const OPENCODE_AGENT_DIR = path.join('.opencode', 'agent');

/** `osq setup` writes the agent file for either harness selection. */
function opencodeConfigured(config: OsqConfig): boolean {
  return config.harness === 'opencode' || config.planner?.harness === 'opencode';
}

function opencodeAgentRelPath(config: OsqConfig): string {
  const configured = config.opencode?.agent;
  const agent = configured ?? DEFAULT_CONFIG.opencode?.agent ?? '';
  return path.join(OPENCODE_AGENT_DIR, `${agent}.md`);
}

/**
 * Compare each managed file's osq block bytes with the installed canonical
 * values, so marker presence alone never counts as healthy. When opencode is
 * the execution or planner harness, the executor agent file `osq setup` writes
 * is inspected too and repaired by `osq setup`, not `osq init`.
 */
export async function checkManagedBlocks(
  projectRoot: string,
  config: OsqConfig,
): Promise<ManagedBlocksResult> {
  const failures: string[] = [];
  for (const { relPath, canonical } of MANAGED_FILES) {
    const fullPath = path.join(projectRoot, relPath);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf8');
    } catch {
      failures.push(`${relPath} is missing`);
      continue;
    }
    const problem = inspectManagedBlock(content, canonical);
    if (problem) failures.push(`${relPath} ${PROBLEM_TEXT[problem]}`);
  }

  const setupFailures: string[] = [];
  if (opencodeConfigured(config)) {
    const relPath = opencodeAgentRelPath(config);
    try {
      const content = await fs.readFile(path.join(projectRoot, relPath), 'utf8');
      const problem = inspectManagedBlock(content, MANAGED_AGENTS_MD_BODY);
      if (problem) setupFailures.push(`${relPath} ${PROBLEM_TEXT[problem]}`);
    } catch {
      setupFailures.push(`${relPath} is missing`);
    }
  }

  const groups = [
    failures.length > 0 ? `${failures.join('; ')} (run osq init)` : '',
    setupFailures.length > 0 ? `${setupFailures.join('; ')} (run osq setup)` : '',
  ].filter((group) => group !== '');

  if (groups.length === 0) {
    return { ok: true, message: 'managed blocks valid' };
  }
  return { ok: false, message: groups.join('; ') };
}
