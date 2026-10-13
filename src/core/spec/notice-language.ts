import { readLanguageMap } from '../../kernel/languages/language-map.js';
import { uncoveredBy } from '../../kernel/languages/presets.js';
import type { OsqConfig } from '../foundation/config.js';
import type { TaskFacts } from './notice-readers.js';
import type { RuleFinding } from './notices.js';

/**
 * The `language_gap` notice: one part per language a task's resolved scope
 * touches whose gates miss it, naming the tasks and the gates in list order.
 * Languages come from `readLanguageMap` with every task's resolved paths as
 * `extra`, so a manifest the change scopes counts before it is committed, and
 * gates from `uncoveredBy`.
 *
 * @scenario spec-lint-and-approve: Rust file in scope
 * @scenario spec-lint-and-approve: TypeScript only
 * @adr 006
 * @adr 017
 */
export async function languageGapNotice(
  projectRoot: string,
  config: OsqConfig,
  tasks: readonly TaskFacts[],
): Promise<RuleFinding | null> {
  const extra = tasks.flatMap((task) => task.paths);
  const map = await readLanguageMap(projectRoot, config, extra);
  const parts: string[] = [];
  for (const language of map.languages) {
    const gates = uncoveredBy(language).gates;
    if (gates.length === 0) continue;
    const taskNumbers = tasks
      .filter((task) => task.paths.some((entry) => map.languageOf(entry) === language))
      .map((task) => `task ${task.number}`);
    if (taskNumbers.length === 0) continue;
    parts.push(`${language} in ${taskNumbers.join(', ')}: no ${gates.join(', ')}`);
  }
  if (parts.length === 0) return null;
  return { id: 'language_gap', label: 'gates miss a language', detail: parts.join('; ') };
}
