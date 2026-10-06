import type { ArchivedCapability } from '../report/archive-record.js';
import type { VcsDiffStat } from '../vcs/vcs.js';
import type { LastSync, LastSyncStop } from './last-sync.js';

/** Which archive gate a recorded run is. */
export type LandGateKind = 'task' | 'verify' | 'check' | 'validator';

/** One gate run osq recorded while archiving the change. */
export interface LandGate {
  readonly kind: LandGateKind;
  /** The task number for a `task` gate; null otherwise. */
  readonly task: string | null;
  /** The command run; `<harness>/<model>` for the validator. */
  readonly command: string;
  /** `passed` or `failed` from the exit code; the validator's own outcome. */
  readonly outcome: string;
  readonly exitCode: number | null;
  /** The event's `duration` in seconds; null when absent. */
  readonly durationSeconds: number | null;
  readonly timestamp: string;
  /** The validator's finding count; null for every other gate. */
  readonly findings: number | null;
}

/** One task's disclosures a lander should read. */
export interface LandDisclosure {
  readonly task: string;
  readonly deviated: string | null;
  readonly outsideScope: string | null;
}

/** A change-level land halt, recorded on the change's branch. */
export interface LandHalt {
  readonly reason: string | null;
  readonly message: string;
}

/** Everything a human needs before landing an archived change. */
export interface LandView {
  readonly folderName: string;
  /** Null when git is off. */
  readonly landed: boolean | null;
  readonly defaultBranch: string | null;
  /** Commits the default branch has that `osq/<folder>` lacks; null when landed, git is off or the branch is gone. */
  readonly mainCommits: number | null;
  readonly gates: readonly LandGate[];
  readonly diff: VcsDiffStat | null;
  readonly capabilities: readonly ArchivedCapability[];
  readonly disclosures: readonly LandDisclosure[];
  readonly halt: LandHalt | null;
  readonly lastSync: LastSync | null;
  readonly lastSyncStop: LastSyncStop | null;
}
