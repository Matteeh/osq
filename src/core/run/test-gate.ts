import type { LanguageMap } from '../../kernel/languages/language-map.js';

/** The directory of paths the frozen-test gate governs. */
export const TEST_GATE_DIR = 'tests';

/** Whether `relativePath` is one of the paths the frozen-test gate governs. */
export function isGatedTestPath(relativePath: string): boolean {
  return relativePath === TEST_GATE_DIR || relativePath.startsWith(`${TEST_GATE_DIR}/`);
}

/**
 * The predicate true for every path the frozen-test gate governs: the root
 * `tests/` folder and every test folder of the language map.
 *
 * @scenario watcher-and-harness: Crate test folders are gated
 * @scenario watcher-and-harness: One gate definition
 * @adr 017
 */
export function gatedTestPathFilter(map: LanguageMap): (relativePath: string) => boolean {
  return (relativePath: string): boolean => {
    if (isGatedTestPath(relativePath)) return true;
    return map.testFolders.some(
      (folder) => relativePath === folder || relativePath.startsWith(`${folder}/`),
    );
  };
}
