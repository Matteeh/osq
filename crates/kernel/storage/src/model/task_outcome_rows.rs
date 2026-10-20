//! Mapping snapshots and the living ownership to the `task_outcomes` rows.
//!
//! A pure leaf, beside the specs kernel's owner lookup: it takes a snapshot and
//! the ownership and gives back row structs, with no disk or SQLite access
//! (ADR 023).

use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet};

use osq_kernel_specs::CapabilityOwnership;
use osq_kernel_specs::owner_capabilities;

use crate::read::{ChangeSnapshot, TaskOutcomeFacts};

use super::rows::{count_i64, flag, len_i64};

/// The quote characters one command token loses at each end.
const QUOTES: [char; 2] = ['\'', '"'];

/// One row of the `task_outcomes` table.
pub(super) struct TaskOutcomeRow {
    /// The change folder.
    pub(super) change: String,
    /// The task id.
    pub(super) task: String,
    /// The capability owning most of the resolved paths, or null.
    pub(super) capability: Option<String>,
    /// The number of entries in the plan's scope.
    pub(super) scope_globs: i64,
    /// The resolved scope size, or null when it was never measured.
    pub(super) scope_files: Option<i64>,
    /// `one`, `several`, `suite` or `other`.
    pub(super) verify_kind: &'static str,
    /// 1 when the plan may change preexisting tests, else 0.
    pub(super) tests_modify: i64,
    /// `red`, `green` or `any`.
    pub(super) verify_starts: &'static str,
    /// 1 when a scope entry was already seen in an earlier task, else 0.
    pub(super) shares_scope: i64,
    /// The task's 1-based place in task order.
    pub(super) position: i64,
    /// The `started` events of the task's stream, 0 without one.
    pub(super) attempts: i64,
    /// 1 when the first attempt passed, else 0.
    pub(super) first_attempt: i64,
    /// The last dead attempt's reason for the task, or null.
    pub(super) dead_reason: Option<String>,
    /// The last `end` measures event's changed file count, or null.
    pub(super) files_touched: Option<i64>,
}

/// Maps one snapshot's tasks to `task_outcomes` rows, in task order.
pub(super) fn task_outcome_rows(
    snapshot: &ChangeSnapshot,
    ownerships: &[CapabilityOwnership],
) -> Vec<TaskOutcomeRow> {
    let mut rows = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for (index, task) in snapshot.tasks.iter().enumerate() {
        let task_id = task.id.as_str().to_owned();
        rows.push(TaskOutcomeRow {
            change: snapshot.folder.clone(),
            task: task_id.clone(),
            capability: capability_for(ownerships, &task.outcome),
            scope_globs: len_i64(task.plan.scope.len()),
            scope_files: scope_files(&task.outcome),
            verify_kind: verify_kind(&task.plan.verify, &snapshot.verify),
            tests_modify: flag(task.plan.tests_modify),
            verify_starts: starts_name(task.plan.verify_starts),
            shares_scope: flag(shares_scope(&task.plan.scope, &mut seen)),
            position: len_i64(index + 1),
            attempts: count_i64(task.started),
            first_attempt: flag(task.outcome.first_attempt_passed),
            dead_reason: dead_reason(snapshot, &task_id),
            files_touched: task.outcome.changed_files.map(count_i64),
        });
    }
    rows
}

/// Whether any scope entry as written was already seen, then records them all.
fn shares_scope(scopes: &[String], seen: &mut BTreeSet<String>) -> bool {
    let shared = scopes.iter().any(|entry| seen.contains(entry));
    for entry in scopes {
        seen.insert(entry.clone());
    }
    shared
}

/// The scope size: the resolved path count when there is one, else the start.
fn scope_files(outcome: &TaskOutcomeFacts) -> Option<i64> {
    let start = outcome.start_scope_files?;
    let count = outcome.scope_hash_paths.as_ref().map_or(start, |paths| {
        u64::try_from(paths.len()).unwrap_or(u64::MAX)
    });
    Some(count_i64(count))
}

/// The capability owning the most resolved paths, the first name on a tie.
fn capability_for(
    ownerships: &[CapabilityOwnership],
    outcome: &TaskOutcomeFacts,
) -> Option<String> {
    let paths = outcome.scope_hash_paths.as_ref()?;
    let mut counts: BTreeMap<String, u64> = BTreeMap::new();
    for path in paths {
        for capability in owner_capabilities(ownerships, path) {
            *counts.entry(capability).or_insert(0) += 1;
        }
    }
    counts
        .into_iter()
        .min_by_key(|(_, count)| Reverse(*count))
        .map(|(capability, _)| capability)
}

/// The last dead attempt's reason for one task, or null without one.
fn dead_reason(snapshot: &ChangeSnapshot, task: &str) -> Option<String> {
    let facts = snapshot.facts.as_ref()?;
    let mut reason = None;
    for dead in &facts.dead_attempts {
        if dead.task == task {
            reason = Some(dead.reason.as_str().to_owned());
        }
    }
    reason
}

/// The `verify_starts` name of a plan.
fn starts_name(starts: osq_kernel_specs::VerifyStarts) -> &'static str {
    match starts {
        osq_kernel_specs::VerifyStarts::Red => "red",
        osq_kernel_specs::VerifyStarts::Green => "green",
        osq_kernel_specs::VerifyStarts::Any => "any",
    }
}

/// The kind of verify a task command declares, as TypeScript's `verifyKind`.
fn verify_kind(verify: &str, change_verify: &str) -> &'static str {
    let count: u64 = test_tokens(verify)
        .iter()
        .map(|token| if token.contains('*') { 2 } else { 1 })
        .sum();
    match count {
        1 => "one",
        2.. => "several",
        _ if verify == change_verify => "suite",
        _ => "other",
    }
}

/// The distinct test-file tokens of a command, in first-seen order.
fn test_tokens(verify: &str) -> Vec<String> {
    let mut distinct: Vec<String> = Vec::new();
    for token in verify.split(is_js_whitespace) {
        let token = strip_quotes(token);
        if token.is_empty() {
            continue;
        }
        if is_test_name(base_name(token)) && !distinct.iter().any(|seen| seen == token) {
            distinct.push(token.to_owned());
        }
    }
    distinct
}

/// Whether a base name holds `.test.` or `.spec.`.
fn is_test_name(name: &str) -> bool {
    name.contains(".test.") || name.contains(".spec.")
}

/// The last `/`-separated segment, trailing slashes removed.
fn base_name(token: &str) -> &str {
    let trimmed = token.trim_end_matches('/');
    match trimmed.rsplit_once('/') {
        Some((_, base)) => base,
        None => trimmed,
    }
}

/// One leading and one trailing `'` or `"` removed.
fn strip_quotes(token: &str) -> &str {
    let mut rest = token;
    if rest.starts_with(&QUOTES[..]) {
        rest = &rest[1..];
    }
    if rest.ends_with(&QUOTES[..]) {
        rest = &rest[..rest.len() - 1];
    }
    rest
}

/// Whether a character is JavaScript's `\s`: Rust whitespace but not U+0085,
/// plus U+FEFF.
fn is_js_whitespace(character: char) -> bool {
    (character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}
