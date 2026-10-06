/**
 * One definition of "test path" for traceability lint, the report's
 * traceability gaps, and the system graph. A test path is `tests`, a path
 * under `tests/`, or a file whose name holds `.test.` or `.spec.`.
 *
 * @scenario traceability: Test and source paths
 */
export function isTestPath(relativePath: string): boolean {
  if (relativePath === 'tests' || relativePath.startsWith('tests/')) return true;
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return base.includes('.test.') || base.includes('.spec.');
}
