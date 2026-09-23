/**
 * Every terminal reason a task attempt can be recorded as dead under. Kept in
 * its own module so `outcome.ts` stays within the strict runner line budget as
 * the reason set grows.
 */
export type RunTaskFailureReason =
  | 'spec_conflict'
  | 'already_running'
  | 'no_result'
  | 'verify_red'
  | 'verify_precondition'
  | 'verify_path_missing'
  | 'change_verify_red'
  | 'crashed'
  | 'timeout'
  | 'undeclared_test_change'
  | 'regressed';
