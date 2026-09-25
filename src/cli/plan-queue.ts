import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { createNewSpec } from '../core/foundation/new.js';
import { buildManifest, writeManifest } from '../core/run/manifest.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import { getSpecsDir } from '../core/status/layout.js';
import { type QueuePlanSelection, prepareQueuePlan } from '../core/status/queue.js';

export function formatBriefContent(
  body: string,
  plannerModel: string | null,
  today: string,
  metadata: Record<string, string> = {},
): string {
  const trimmed = body.trim();
  const parsed = parseFrontmatter(trimmed);
  const frontmatterData = {
    ...metadata,
    ...parsed.data,
    planner: plannerModel,
    date: today,
  };

  const yamlLines = Object.entries(frontmatterData).map(([k, v]) => `${k}: ${v}`);
  const fm = `---\n${yamlLines.join('\n')}\n---\n\n`;
  const cleanBody = parsed.body.trim();

  return `${fm}${cleanBody}\n`;
}

/** The first four ordered prompt sections; the repository record is appended by `plan.ts`. */
export async function buildBaseOpeningPrompt(options: {
  projectRoot: string;
  folderPath: string;
  specId: string;
  specTitle: string;
  briefContent: string;
  openspecRoot: string;
  dependencyPaths?: readonly string[];
}): Promise<string> {
  const { projectRoot, folderPath, specId, specTitle, briefContent, openspecRoot } = options;

  let plannerMd = '';
  try {
    plannerMd = await fs.readFile(path.join(projectRoot, 'PLANNER.md'), 'utf8');
  } catch {
    plannerMd = '# Planning a change for osq\n';
  }

  const changeLines = [
    `# Change: ${specId} - ${specTitle}`,
    `Change ID: ${specId}`,
    `Change Folder: ${path.basename(folderPath)}`,
  ];
  if (options.dependencyPaths && options.dependencyPaths.length > 0) {
    const paths = options.dependencyPaths.map((dep) => `- ${dep}`).join('\n');
    changeLines.push(`Landed dependencies:\n${paths}`);
  }
  const changeHeader = changeLines.join('\n');

  const specsDir = getSpecsDir(openspecRoot, projectRoot);
  const specPaths: string[] = [];
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        const rel = path.relative(projectRoot, path.join(specsDir, entry.name, 'spec.md'));
        specPaths.push(rel);
      }
    }
  } catch {}
  const specsHeader = `## Capability Specs\n\nAll living specs. Read the ones this change writes or whose code it uses.\n\n${specPaths.map((p) => `- ${p}`).join('\n')}`;

  const briefHeader = `## Brief\n\n${briefContent.trim()}`;

  return [plannerMd.trim(), changeHeader.trim(), specsHeader.trim(), briefHeader.trim()].join(
    '\n\n',
  );
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

/**
 * Default handoff: persist the transient prompt beside the change and name the
 * exact change an available planning tool should pick up, with its next step.
 */
export async function writePromptHandoff(
  folderPath: string,
  openingPrompt: string,
  nextStep: string,
): Promise<void> {
  await fs.writeFile(path.join(folderPath, 'plan-prompt.md'), openingPrompt, 'utf8');
  console.log(
    `${folderPath}: ask your planning tool to plan change ${path.basename(folderPath)} \u2014 next: ${nextStep}`,
  );
}

/** Reject ordinary and queue mode combinations before any file is touched. */
export function validatePlanModeOptions(
  name: string,
  options: {
    next?: boolean;
    replan?: boolean;
    brief?: string;
    print?: boolean;
    session?: boolean;
  },
): void {
  if (options.session && options.print) {
    throw new Error('`--session` cannot be combined with `--print`');
  }
  if (options.next) {
    if (name) throw new Error('`plan --next` cannot be combined with a change name');
    if (options.brief) throw new Error('`plan --next` cannot be combined with --brief');
  } else if (options.replan) {
    throw new Error('`--replan` is valid only with `plan --next`');
  } else if (!name) {
    throw new Error('Provide a change name or use `plan --next`');
  }
}

/**
 * Run the read-only next-item preparation with the explicit config the caller
 * already loaded. Refusals and the incomplete-cost notice are reported here and
 * nothing is written; `null` tells the caller to stop before mutation.
 */
export async function prepareQueueSelection(
  projectRoot: string,
  config: OsqConfig,
  options: { replan?: boolean; print?: boolean },
): Promise<QueuePlanSelection | null> {
  const preparation = await prepareQueuePlan(projectRoot, config, {
    replan: options.replan,
    enforceBudget: !options.print,
  });
  if (preparation.kind === 'refused') {
    console.error(preparation.message);
    process.exitCode = 1;
    return null;
  }
  if (preparation.notice) console.error(preparation.notice);
  return preparation.selection;
}

export async function createChange(
  projectRoot: string,
  quiet: boolean | undefined,
  title: string,
  options: { slug?: string; dependsOn?: readonly string[]; fixes?: readonly string[] },
): Promise<{ folderPath: string; specId: string }> {
  const newResult = await createNewSpec(projectRoot, title, {
    slug: options.slug,
    dependsOn: options.dependsOn,
    fixes: options.fixes,
  });
  if (!quiet) {
    console.log(`Created spec ${newResult.specId}: ${newResult.folderName}`);
    console.log(`  Path: ${newResult.folderPath}`);
  }
  return { folderPath: newResult.folderPath, specId: newResult.specId };
}

export async function writeBriefAndManifest(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
  plannerModel: string | null,
  briefBody: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await fs.writeFile(
    path.join(folderPath, 'brief.md'),
    formatBriefContent(briefBody, plannerModel, today, metadata),
    'utf8',
  );
  const runDir = path.join(folderPath, '.run');
  await fs.mkdir(runDir, { recursive: true });
  await writeManifest(runDir, await buildManifest(projectRoot, folderPath, config));
}

/** Create the selected queue item's change with queue metadata on its brief. */
export async function createQueueChange(
  projectRoot: string,
  config: OsqConfig,
  quiet: boolean | undefined,
  selection: QueuePlanSelection,
  plannerModel: string | null,
): Promise<{ folderPath: string; specId: string }> {
  const created = await createChange(projectRoot, quiet, selection.item.title, {
    slug: selection.item.slug,
    dependsOn: selection.landedDependencies.map((dep) => dep.changeId),
    fixes: selection.landedFixes.map((fix) => fix.changeId),
  });
  await writeBriefAndManifest(
    projectRoot,
    config,
    created.folderPath,
    plannerModel,
    selection.item.body,
    { queue_item: selection.item.slug, queue_hash: selection.item.hash },
  );
  return created;
}
