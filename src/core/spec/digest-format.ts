import type { ApprovalDigest } from './digest.js';

/** Render the digest body, without flags. */
export function formatApprovalDigest(digest: ApprovalDigest): string {
  const lines: string[] = [`Change: ${digest.change}`];
  if (digest.goal) lines.push(`Goal: ${digest.goal}`);
  if (digest.beforeApproval) {
    lines.push('Before approval, do these first:');
    for (const line of digest.beforeApproval.split('\n')) lines.push(`  ${line.trim()}`);
  }
  lines.push('Tasks:');
  for (const task of digest.tasks) {
    const suffix = task.scopeFiles === 1 ? 'scope file' : 'scope files';
    lines.push(`  ${task.number}. ${task.title} (${task.scopeFiles} ${suffix})`);
    if (task.testsModify) {
      const tests = task.existingTests.length > 0 ? task.existingTests.join(', ') : '(none)';
      lines.push(`     tests.modify: existing tests in scope: ${tests}`);
    }
  }
  lines.push('Capabilities:');
  if (digest.capabilities.length === 0) lines.push('  (none)');
  for (const capability of digest.capabilities) {
    const creation = capability.creates ? ' (new capability)' : '';
    lines.push(`  ${capability.name}${creation}:`);
    for (const kind of ['added', 'modified', 'removed'] as const) {
      const names = capability[kind];
      lines.push(`    ${kind}: ${names.length > 0 ? names.join(', ') : '(none)'}`);
    }
  }
  if (digest.decisions.length > 0) {
    lines.push('Decisions:');
    for (const decision of digest.decisions) {
      lines.push(`  ADR ${decision.number}: ${decision.rule}`);
    }
  }
  if (digest.humanSteps) {
    lines.push('Human steps:');
    for (const line of digest.humanSteps.split('\n')) lines.push(`  ${line.trim()}`);
  }
  return lines.join('\n');
}
