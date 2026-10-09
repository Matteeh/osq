import { DEFAULT_NOTICES_CONFIG } from '../foundation/config-notices.js';
import type { OsqConfig } from '../foundation/config.js';
import type { ApprovalDigest } from './digest.js';
import { collectApprovalNotices } from './notice-rules.js';

export type NoticeSeverity = 'red' | 'amber' | 'grey';

export type ApprovalNoticeId =
  | 'rules_path'
  | 'removed_requirement'
  | 'adr_departure'
  | 'many_tasks'
  | 'large_scope'
  | 'package_json'
  | 'assumptions'
  | 'verify_starts_any'
  | 'uncovered_requirement'
  | 'tests_modify'
  | 'new_capability'
  | 'plan_revised';

export interface ApprovalNotice {
  readonly id: ApprovalNoticeId;
  readonly severity: NoticeSeverity;
  readonly label: string;
  readonly detail: string;
}

/** A change's notices in display order, and how many lead before the rest fold. */
export interface ApprovalNotices {
  readonly notices: readonly ApprovalNotice[];
  readonly maxShown: number;
  /** False exactly when no notice is red or amber. */
  readonly unusual: boolean;
}

/** One notice as osq records it in `plan.jsonl` and the manifest. */
export interface RecordedNotice {
  readonly id: ApprovalNoticeId;
  readonly severity: NoticeSeverity;
  readonly folded: boolean;
}

/** One rule's raw finding, before ordering and severity are attached. */
export interface RuleFinding {
  readonly id: ApprovalNoticeId;
  readonly label: string;
  readonly detail: string;
}

/** Red before amber before grey; within a severity, the rule order. */
const NOTICE_ORDER: readonly ApprovalNoticeId[] = [
  'rules_path',
  'removed_requirement',
  'adr_departure',
  'many_tasks',
  'large_scope',
  'package_json',
  'assumptions',
  'verify_starts_any',
  'uncovered_requirement',
  'tests_modify',
  'new_capability',
  'plan_revised',
];

const SEVERITY: Record<ApprovalNoticeId, NoticeSeverity> = {
  rules_path: 'red',
  removed_requirement: 'red',
  adr_departure: 'red',
  many_tasks: 'amber',
  large_scope: 'amber',
  package_json: 'amber',
  assumptions: 'amber',
  verify_starts_any: 'amber',
  uncovered_requirement: 'amber',
  tests_modify: 'grey',
  new_capability: 'grey',
  plan_revised: 'grey',
};

/**
 * Derive a change's notices from its change folder, its approval digest, and
 * config alone, with at most one notice per id.
 *
 * @scenario spec-lint-and-approve: Each rule fires on its own
 * @scenario spec-lint-and-approve: Nothing unusual
 */
export async function buildApprovalNotices(
  projectRoot: string,
  folderPath: string,
  config: OsqConfig,
  digest: ApprovalDigest,
): Promise<ApprovalNotices> {
  const noticesConfig = config.notices ?? DEFAULT_NOTICES_CONFIG;
  const findings = await collectApprovalNotices({ projectRoot, folderPath, config, digest });
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const notices: ApprovalNotice[] = [];
  for (const id of NOTICE_ORDER) {
    const finding = byId.get(id);
    if (finding)
      notices.push({ id, severity: SEVERITY[id], label: finding.label, detail: finding.detail });
  }
  const unusual = notices.some(
    (notice) => notice.severity === 'red' || notice.severity === 'amber',
  );
  return { notices, maxShown: noticesConfig.maxShown, unusual };
}

/**
 * The `Notices:` lines `osq approve` prints.
 *
 * @scenario spec-lint-and-approve: Seven notices
 * @scenario spec-lint-and-approve: Nothing unusual
 */
export function formatApprovalNotices(notices: ApprovalNotices): string[] {
  const lines = [notices.unusual ? 'Notices:' : 'Notices: Nothing unusual'];
  for (const notice of notices.notices.slice(0, notices.maxShown)) {
    lines.push(`  ${notice.severity.toUpperCase()} ${notice.label} \u2014 ${notice.detail}`);
  }
  const folded = notices.notices.slice(notices.maxShown);
  if (folded.length > 0) {
    lines.push(`  ${folded.length} more: ${folded.map((notice) => notice.label).join(', ')}`);
  }
  return lines;
}

/** Each notice as recorded, `folded` from its position against `maxShown`. */
export function recordNotices(notices: ApprovalNotices): RecordedNotice[] {
  return notices.notices.map((notice, index) => ({
    id: notice.id,
    severity: notice.severity,
    folded: index >= notices.maxShown,
  }));
}
