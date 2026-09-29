/** The directory of paths the frozen-test gate governs. */
export const TEST_GATE_DIR = 'tests';

/** Whether `relativePath` is one of the paths the frozen-test gate governs. */
export function isGatedTestPath(relativePath: string): boolean {
  return relativePath === TEST_GATE_DIR || relativePath.startsWith(`${TEST_GATE_DIR}/`);
}
