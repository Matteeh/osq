import { formatApprovalDigest } from '../spec/digest-format.js';
import type {
  ApprovalCard,
  DispatchCard,
  HaltCard,
  LandCard,
  VerifyCard,
} from './dispatch-cards.js';
import type { OrderedDispatchItem } from './dispatch-order.js';
import type { DispatchPreview } from './dispatch.js';

/** A `label:` line with each value line indented under it, or nothing. */
function block(label: string, value: string): string[] {
  if (value === '') return [];
  return [`  ${label}:`, ...value.split('\n').map((line) => `    ${line}`)];
}

/** A `label:` line with one indented entry per value, or nothing. */
function listBlock(label: string, values: readonly string[]): string[] {
  if (values.length === 0) return [];
  return [`  ${label}:`, ...values.map((line) => `    ${line}`)];
}

/** A single `label: value` line, or nothing when the value is empty. */
function scalar(label: string, value: string | null): string[] {
  return value === null || value === '' ? [] : [`  ${label}: ${value}`];
}

/** The approval digest, as `osq approve` prints it. */
function approvalLines(card: ApprovalCard): string[] {
  return formatApprovalDigest(card.digest).split('\n');
}

/** The halt evidence for a task or a whole change. */
function haltLines(card: HaltCard): string[] {
  if (card.target === 'task') {
    return [
      `  task ${card.taskNumber}: ${card.title}`,
      ...scalar('reason', card.reason),
      `  attempts: ${card.attempts}`,
      ...listBlock('output', card.output),
      ...scalar('patch', card.patch),
    ];
  }
  return [...scalar('reason', card.reason), ...listBlock('output', card.output)];
}

/** The land evidence: goal, outcome lines, and the squash message. */
function landLines(card: LandCard): string[] {
  return [
    ...scalar('goal', card.goal),
    ...listBlock('outcomes', card.outcomes),
    ...block('squash', card.squash ?? ''),
  ];
}

/** The verification evidence: check, after-landing steps, and outcome. */
function verifyLines(card: VerifyCard): string[] {
  return [
    ...scalar('check', card.check),
    ...block('after landing', card.afterLanding),
    ...scalar('outcome', card.outcome),
  ];
}

/** The card header, its reason, the body for its kind, and its actions. */
function cardLines(item: OrderedDispatchItem, card: DispatchCard): string[] {
  const lines: string[] = [`${item.kind}: ${item.change.folder}`, `  why: ${item.reason}`];
  switch (card.kind) {
    case 'approval':
      lines.push(...approvalLines(card));
      break;
    case 'halt':
      lines.push(...haltLines(card));
      break;
    case 'land':
      lines.push(...landLines(card));
      break;
    case 'verify':
      lines.push(...verifyLines(card));
      break;
  }
  lines.push('Actions:');
  for (const command of item.commands) lines.push(`  ${command}`);
  return lines;
}

/**
 * `<kind> <id> <title>[ task <n>: <title>] (<reason>)`, the text after the
 * position on each list line and the text the follow loop prints after `+`.
 */
export function formatDispatchItemSummary(item: OrderedDispatchItem): string {
  const task = item.task ? ` task ${item.task.number}: ${item.task.title}` : '';
  return `${item.kind} ${item.change.id} ${item.change.title}${task} (${item.reason})`;
}

/** One `  <n>. <kind> <id> <title>[ task <n>: <title>] (<reason>)` line. */
function itemLine(item: OrderedDispatchItem, position: number): string {
  return `  ${position}. ${formatDispatchItemSummary(item)}`;
}

/** The ordered list and, when one exists, the first item's card. */
export function formatDispatchText(preview: DispatchPreview): string {
  if (preview.items.length === 0) return 'Nothing needs you.';
  const lines = [`Needs you (${preview.items.length}):`];
  preview.items.forEach((item, index) => lines.push(itemLine(item, index + 1)));
  lines.push('');
  const [first] = preview.items;
  if (first && preview.card) lines.push(...cardLines(first, preview.card));
  return lines.join('\n');
}
