//! Counting the history figures TypeScript's report counts from task streams.
//!
//! Implements: rust-report/report-history

use std::collections::BTreeMap;

use osq_kernel_storage::{
    ChangeEntry, Location, PreSpawnHistory, RetryGroup, ScopeHistory, StartCount, TaskHistory,
    read_now_facts, read_rejection_planner, read_task_history,
};

use super::js_number;

/// Every History figure one report prints.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct History {
    /// The sum of every task's attempts.
    pub(crate) attempts_total: u64,
    /// Every counted task's attempts, by task id.
    pub(crate) attempts_by_task: BTreeMap<String, u64>,
    /// The task ids with more than one attempt, sorted by bytes.
    pub(crate) multiple_attempts: Vec<String>,
    /// The sum of every task's unexplained re-runs.
    pub(crate) unexplained_total: u64,
    /// The tasks with an unexplained re-run, by task id.
    pub(crate) unexplained_by_task: BTreeMap<String, u64>,
    /// The number of dead outcomes per reason.
    pub(crate) dead_by_reason: BTreeMap<String, u64>,
    /// The number of verification runs.
    pub(crate) verify_total: u64,
    /// The verification runs without an exit code.
    pub(crate) verify_missing_exit_code: u64,
    /// The verification exit codes of every task with a run, by task id.
    pub(crate) verify_by_task: BTreeMap<String, Vec<Option<f64>>>,
    /// The pre-spawn verify totals.
    pub(crate) pre_spawn: PreSpawnHistory,
    /// The task ids with more than one pre-spawn mismatch, sorted by bytes.
    pub(crate) pre_spawn_mismatched_tasks: Vec<String>,
    /// The sum of every task's cost values in task order.
    pub(crate) cost_total: f64,
    /// The cost sum of every change folder whose sum is above zero.
    pub(crate) cost_per_spec: BTreeMap<String, f64>,
    /// The attempts holding a cost.
    pub(crate) cost_reported_attempts: u64,
    /// The retry-opened attempts and stuck events.
    pub(crate) retries: Retries,
    /// The number of rejected changes that give a planner.
    pub(crate) rejections_total: u64,
    /// The rejected changes per planner model.
    pub(crate) rejections_by_planner: BTreeMap<String, u64>,
    /// The scope-regression and recertification totals.
    pub(crate) scope: ScopeHistory,
    /// The total cost as TypeScript's reported cost text writes it.
    pub(crate) formatted_total: String,
}

/// The automatic and manual retry groups and the stuck events.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Retries {
    /// The attempts opened by an automatic `retry` event.
    pub(crate) automatic: RetryGroup,
    /// The attempts opened by a manual `retry` event.
    pub(crate) manual: RetryGroup,
    /// The number of `stuck` events.
    pub(crate) stuck: u64,
}

/// Reads every counted task and rejected change in entry order.
///
/// Implements: rust-report/report-history
pub(crate) fn read(entries: &[ChangeEntry]) -> History {
    let mut history = History::default();
    for entry in entries {
        if entry.location == Location::Rejected {
            add_rejection(&mut history, entry);
        } else {
            add_change(&mut history, entry);
        }
    }
    history.multiple_attempts.sort();
    history.pre_spawn_mismatched_tasks.sort();
    history.cost_per_spec.retain(|_, value| *value > 0.0);
    history.formatted_total =
        js_number::reported_cost(history.cost_total, history.cost_reported_attempts);
    history
}

/// Adds one change folder's task histories.
fn add_change(history: &mut History, entry: &ChangeEntry) {
    let facts = read_now_facts(&entry.path);
    for task in &facts.tasks {
        let id = format!("{}/{}", entry.folder, task.id);
        let task_history = read_task_history(&entry.path, &task.id);
        add_task(history, &entry.folder, &id, &task_history);
    }
}

/// Adds one rejected change when its stream holds a rejection.
fn add_rejection(history: &mut History, entry: &ChangeEntry) {
    let Some(planner) = read_rejection_planner(&entry.path) else {
        return;
    };
    history.rejections_total += 1;
    *history.rejections_by_planner.entry(planner).or_default() += 1;
}

/// Adds one task's history under its task id and change folder.
fn add_task(history: &mut History, folder: &str, id: &str, task: &TaskHistory) {
    history.attempts_total += task.attempts;
    history
        .attempts_by_task
        .insert(id.to_owned(), task.attempts);
    if task.attempts > 1 {
        history.multiple_attempts.push(id.to_owned());
    }
    if task.unexplained > 0 {
        history.unexplained_total += task.unexplained;
        history
            .unexplained_by_task
            .insert(id.to_owned(), task.unexplained);
    }
    for reason in &task.dead_reasons {
        *history.dead_by_reason.entry(reason.clone()).or_default() += 1;
    }
    add_verify(history, id, &task.verify_codes);
    add_pre_spawn(history, id, task);
    for value in &task.costs {
        history.cost_total += value;
        *history.cost_per_spec.entry(folder.to_owned()).or_default() += value;
    }
    history.cost_reported_attempts += task.cost_reported_attempts;
    add_retries(history, task);
    add_scope(history, &task.scope);
}

/// Adds one task's verification runs.
fn add_verify(history: &mut History, id: &str, codes: &[Option<f64>]) {
    history.verify_total += u64::try_from(codes.len()).expect("a run count fits in a u64");
    history.verify_missing_exit_code +=
        u64::try_from(codes.iter().filter(|code| code.is_none()).count())
            .expect("a missing count fits in a u64");
    if !codes.is_empty() {
        history.verify_by_task.insert(id.to_owned(), codes.to_vec());
    }
}

/// Adds one task's pre-spawn verify runs and declared starts.
fn add_pre_spawn(history: &mut History, id: &str, task: &TaskHistory) {
    let pre_spawn = &task.pre_spawn;
    history.pre_spawn.runs += pre_spawn.runs;
    history.pre_spawn.mismatches += pre_spawn.mismatches;
    history.pre_spawn.missing_path_runs += pre_spawn.missing_path_runs;
    add_start(&mut history.pre_spawn.red, &pre_spawn.red);
    add_start(&mut history.pre_spawn.green, &pre_spawn.green);
    add_start(&mut history.pre_spawn.any, &pre_spawn.any);
    if pre_spawn.mismatches > 0 {
        history.pre_spawn_mismatched_tasks.push(id.to_owned());
    }
}

/// Adds one declared start's runs and passes.
fn add_start(total: &mut StartCount, task: &StartCount) {
    total.runs += task.runs;
    total.passed += task.passed;
}

/// Adds one task's retry groups and stuck events.
fn add_retries(history: &mut History, task: &TaskHistory) {
    add_group(&mut history.retries.automatic, &task.automatic);
    add_group(&mut history.retries.manual, &task.manual);
    history.retries.stuck += task.stuck;
}

/// Adds one retry group's counts and cost.
fn add_group(total: &mut RetryGroup, task: &RetryGroup) {
    total.count += task.count;
    total.reached_done += task.reached_done;
    total.cost += task.cost;
    total.cost_reported_attempts += task.cost_reported_attempts;
}

/// Adds one task's scope regressions and recertifications.
fn add_scope(history: &mut History, task: &ScopeHistory) {
    history.scope.detected += task.detected;
    history.scope.passed_at_detection += task.passed_at_detection;
    history.scope.failed_at_detection += task.failed_at_detection;
    history.scope.recertified_by_human += task.recertified_by_human;
    history.scope.recertified_automatically += task.recertified_automatically;
    history.scope.requeued_for_agent += task.requeued_for_agent;
}
