import { readLanguageMap } from '../../kernel/languages/language-map.js';
import { uncoveredBy } from '../../kernel/languages/presets.js';
import type { OsqConfig } from './config.js';
import type { DoctorCheckResult } from './doctor.js';

/** TypeScript/JavaScript is the one language every gate and extra covers. */
const TYPESCRIPT = 'TypeScript/JavaScript';

/**
 * The `languages` doctor check, right after the `git` checks: it warns when a
 * project holds a language other than TypeScript/JavaScript, naming the gates
 * and extras that do not cover each such language. It passes with a warning
 * when some language lacks a gate and never changes doctor's exit code. When
 * every language is TypeScript/JavaScript, or there is none, it adds no check.
 *
 * @scenario cli-foundation: Rust beside TypeScript
 * @scenario cli-foundation: Pure TypeScript project
 * @adr 006
 * @adr 017
 */
export async function checkLanguages(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult[]> {
  const map = await readLanguageMap(projectRoot, config);
  const others = map.languages.filter((language) => language !== TYPESCRIPT);
  if (others.length === 0) return [];

  let message = map.languages.join(', ');
  let lacksGate = false;
  for (const language of others) {
    const { gates, extras } = uncoveredBy(language);
    if (gates.length === 0 && extras.length === 0) continue;
    if (gates.length > 0) lacksGate = true;
    const parts: string[] = [];
    if (gates.length > 0) parts.push(`gates: ${gates.join(', ')}`);
    if (extras.length > 0) parts.push(`extras: ${extras.join(', ')}`);
    message += `. ${language} lacks ${parts.join('; ')}`;
  }
  return [{ name: 'languages', ok: true, ...(lacksGate ? { warning: true } : {}), message }];
}
