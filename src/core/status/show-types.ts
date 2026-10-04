import type { ApprovalDigest } from '../spec/digest.js';
import type { TaggedScenario } from '../trace/tag-scan.js';
import type { NextStep } from './next-step.js';
import type { SpecStatus, TaskStatus } from './state.js';

export interface TimelineEvent {
  taskNumber: string;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/** One differing path paired with its recorded later-task attribution. */
export interface RecertificationAttribution {
  path: string;
  attribution: string;
}

/**
 * One human recertification decision projected from a typed `recertification`
 * event. Every optional field is independently nullable so malformed event data
 * renders as unavailable without dropping the decision.
 */
export interface RecertificationDetail {
  taskNumber: string;
  timestamp: string | null;
  outcome: 'passed' | 'requeued' | null;
  differingPaths: string[];
  attribution: RecertificationAttribution[];
  verify: string | null;
  exitCode: number | null;
  timedOut: boolean | null;
}

export interface TaskDetail {
  taskNumber: string;
  fileName: string;
  title: string;
  status: TaskStatus;
  verify: string;
  scope: string[];
  entry: string[];
  skills: string[];
  acceptance: string[];
  /** Distinct scenario pairs named by scenario test files in the resolved scope. */
  scenarios?: TaggedScenario[];
  deadReason?: string;
  deadDiagnostic?: string;
  regressedReason?: string;
  regressedDiagnostic?: string;
  resultContent?: string;
  events: TimelineEvent[];
}

/**
 * One correlated planning lifecycle pair for display. Only lifecycle
 * identity, timing, and outcome are exposed; token usage and artifact paths
 * stay in the append-only log.
 */
export interface PlanningSessionDetail {
  sessionId: string;
  startTime: string;
  harness: string;
  /** Null when neither the owned nor the observed record reported a model. */
  model: string | null;
  agent?: string;
  exitCode: number | null;
  wallSeconds: number | null;
}

/** One recorded `check_ran` event of an archived change. */
export interface VerificationCheckRow {
  time: string;
  command: string;
  exitCode: number | null;
}

/** One recorded human `verification_recorded` outcome of an archived change. */
export interface VerificationOutcomeRow {
  time: string;
  outcome: 'passed' | 'failed' | null;
  note: string | null;
}

/** The change-level verification history of an archived change. */
export interface VerificationHistory {
  checks: VerificationCheckRow[];
  outcomes: VerificationOutcomeRow[];
}

export interface SpecDetails {
  id: string;
  folderName: string;
  folderPath: string;
  isArchived: boolean;
  location: 'active' | 'archived' | 'rejected';
  title: string;
  status: SpecStatus;
  approvedHash: string | null;
  dependsOn: string[];
  features: {
    reads: string[];
    writes: string[];
  };
  goal: string;
  contract: string;
  nonGoals: string;
  delta: string;
  /** The proposal's `## Surface` text; a built model always sets it, empty when absent. */
  surface?: string;
  /** The proposal's `## Decisions` text; a built model always sets it, empty when absent. */
  decisions?: string;
  /** The proposal's `### Before approval` steps; a built model always sets it, empty when absent. */
  beforeApproval?: string;
  /** The approval digest for an unapproved change; a built model sets it, else null. */
  digest?: ApprovalDigest | null;
  tasks: TaskDetail[];
  planningSessions: PlanningSessionDetail[];
  recertifications: RecertificationDetail[];
  timeline: TimelineEvent[];
  /** What the change needs next; absent for rejected changes. */
  next?: NextStep;
  /** Present only for an archived change whose events hold verification rows. */
  verification?: VerificationHistory;
  /** The proposal's `### After landing` steps; absent when empty. */
  afterLanding?: string;
}

/** A list of trimmed non-empty strings, or an empty list for any other value. */
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim());
}
