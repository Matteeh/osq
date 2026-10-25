export interface OsqTimeouts {
  readonly staleLockSeconds: number;
  readonly taskTimeoutSeconds: number;
  readonly verifyTimeoutSeconds: number;
  /** Preflight `--version` probe deadline; defaults to 10 seconds. */
  readonly harnessPreflightSeconds?: number;
  /** Kill grace after SIGTERM before SIGKILL; defaults to 5000 milliseconds. */
  readonly harnessKillGracePeriodMs?: number;
  readonly gitSeconds?: number;
  readonly gitCommitSeconds?: number;
  readonly gitRemoteSeconds?: number;
  readonly gitWorktreeRemoveSeconds?: number;
}
