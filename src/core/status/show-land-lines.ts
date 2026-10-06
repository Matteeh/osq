import type { SpecDetails } from './show-types.js';

type LandView = NonNullable<SpecDetails['land']>;
type LandGate = LandView['gates'][number];

/** The first line of a message, or an empty string. */
function firstLine(text: string): string {
  return text.split('\n')[0] ?? '';
}

/** The gate's name in the summary: `task <n>` or its kind. */
function gateName(gate: LandGate): string {
  return gate.kind === 'task' ? `task ${gate.task ?? ''}` : gate.kind;
}

/** One gate line; a failed gate adds its exit code and the validator its count. */
function gateLine(gate: LandGate): string {
  const seconds = gate.durationSeconds === null ? 0 : Math.round(gate.durationSeconds);
  const outcome =
    gate.outcome === 'failed' && gate.exitCode !== null
      ? `${gate.outcome} exit ${gate.exitCode}`
      : gate.outcome;
  const findings = gate.kind === 'validator' ? `, ${gate.findings ?? 0} findings` : '';
  return `    ${gateName(gate)}: ${outcome} in ${seconds}s (${gate.command})${findings}`;
}

/** The `Land:` headline for the view's landed state. */
function headline(land: LandView): string {
  if (land.landed === null) return 'Land: git is off';
  if (land.landed) return 'Land: landed';
  if (land.mainCommits === null) {
    return `Land: not landed; branch osq/${land.folderName} not found`;
  }
  const branch = land.defaultBranch ?? 'main';
  if (land.mainCommits === 0) {
    return `Land: not landed; ${branch} has not moved since archive`;
  }
  const noun = land.mainCommits === 1 ? 'commit' : 'commits';
  return `Land: not landed; ${branch} has ${land.mainCommits} new ${noun} since archive, so osq land will sync and verify again`;
}

/** The `Gates at archive` block, or the none-recorded line. */
function gateLines(land: LandView): string[] {
  if (land.gates.length === 0) return ['  Gates at archive: none recorded'];
  return ['  Gates at archive:', ...land.gates.map((gate) => gateLine(gate))];
}

/** The `Spec changes` block, or no lines without capabilities. */
function capabilityLines(land: LandView): string[] {
  if (land.capabilities.length === 0) return [];
  return [
    '  Spec changes:',
    ...land.capabilities.map(
      (capability) =>
        `    ${capability.name}: ${capability.added.length} added, ${capability.modified.length} modified, ${capability.removed.length} removed, ${capability.renamed.length} renamed`,
    ),
  ];
}

/** The one-line disclosure summary, or no lines when nothing was disclosed. */
function disclosureLines(land: LandView): string[] {
  const parts: string[] = [];
  for (const disclosure of land.disclosures) {
    if (disclosure.deviated !== null) parts.push(`task ${disclosure.task} deviated`);
    if (disclosure.outsideScope !== null) parts.push(`task ${disclosure.task} outside scope`);
  }
  return parts.length === 0 ? [] : [`  Disclosures: ${parts.join(', ')}`];
}

/**
 * The `Land:` section lines for an archived change whose detail carries a land
 * view, or no lines otherwise. It reads no files.
 */
export function landLines(details: SpecDetails): string[] {
  const land = details.land;
  if (!land) return [];
  const lines = ['', headline(land), ...gateLines(land)];
  if (land.diff) {
    lines.push(`  Diff: ${land.diff.files} files, +${land.diff.added} -${land.diff.removed}`);
  }
  lines.push(...capabilityLines(land), ...disclosureLines(land));
  if (land.halt) {
    lines.push(`  Halted: ${land.halt.reason ?? 'unknown'}: ${firstLine(land.halt.message)}`);
  }
  if (land.lastSyncStop) {
    lines.push(
      `  Sync stopped: ${land.lastSyncStop.reason}: ${firstLine(land.lastSyncStop.message)}`,
    );
  }
  return lines;
}
