//! Writing the `History:` lines TypeScript's report prints.
//!
//! Implements: rust-report/report-history

use std::collections::BTreeMap;

use osq_kernel_storage::RetryGroup;

use super::history::History;
use super::js_number;

/// Writes the `History:` lines, without a trailing newline.
///
/// Implements: rust-report/report-history
pub(crate) fn text(history: &History) -> String {
    let mut lines = vec![
        format!("  Total attempts: {}", history.attempts_total),
        format!(
            "  Tasks with multiple attempts: {}",
            history.multiple_attempts.len()
        ),
        format!("  Unexplained re-runs: {}", history.unexplained_total),
        format!("  Verification runs: {}", history.verify_total),
        format!(
            "  Verification runs missing exit code: {}",
            history.verify_missing_exit_code
        ),
        format!(
            "  Pre-spawn verify mismatches: {} of {} runs",
            history.pre_spawn.mismatches, history.pre_spawn.runs
        ),
        format!(
            "  Pre-spawn verify with missing paths: {} of {} runs",
            history.pre_spawn.missing_path_runs, history.pre_spawn.runs
        ),
        format!(
            "  Pre-spawn verify by declared start: red {} of {} passed, green {} of {} passed, any {} of {} passed",
            history.pre_spawn.red.passed,
            history.pre_spawn.red.runs,
            history.pre_spawn.green.passed,
            history.pre_spawn.green.runs,
            history.pre_spawn.any.passed,
            history.pre_spawn.any.runs,
        ),
        "  Automatic retries:".to_owned(),
        retry_line("automatic", &history.retries.automatic),
        retry_line("manual", &history.retries.manual),
        format!("  Stuck: {}", history.retries.stuck),
        format!(
            "  Harness-reported cost: {} ({} of {} attempts reported cost)",
            history.formatted_total, history.cost_reported_attempts, history.attempts_total,
        ),
        "  Dead by reason:".to_owned(),
    ];
    append_counts(&mut lines, &history.dead_by_reason);
    lines.push(format!("  Rejections: {}", history.rejections_total));
    lines.push("  Rejections by planner model:".to_owned());
    append_counts(&mut lines, &history.rejections_by_planner);
    lines.push("  Scope regressions:".to_owned());
    lines.push(format!("    Detected: {}", history.scope.detected));
    lines.push(format!(
        "    Verification passed at detection: {}",
        history.scope.passed_at_detection
    ));
    lines.push(format!(
        "    Verification failed at detection: {}",
        history.scope.failed_at_detection
    ));
    lines.push(format!(
        "    Recertified by human: {}",
        history.scope.recertified_by_human
    ));
    lines.push(format!(
        "    Recertified automatically: {}",
        history.scope.recertified_automatically
    ));
    lines.push(format!(
        "    Requeued for agent: {}",
        history.scope.requeued_for_agent
    ));
    lines.join("\n")
}

/// Writes one retry group's line under `Automatic retries:`.
fn retry_line(name: &str, group: &RetryGroup) -> String {
    let cost = js_number::reported_cost(group.cost, group.cost_reported_attempts);
    format!(
        "  {name}: {} retries, {} reached done, cost {cost} ({} of {} attempts reported cost)",
        group.count, group.reached_done, group.cost_reported_attempts, group.count,
    )
}

/// Appends one count table, or `(none)` when it is empty.
fn append_counts(lines: &mut Vec<String>, counts: &BTreeMap<String, u64>) {
    if counts.is_empty() {
        lines.push("    (none)".to_owned());
        return;
    }
    for (name, count) in sorted(counts) {
        lines.push(format!("    {name}: {count}"));
    }
}

/// The entries ordered by lowercase name, then by the names' bytes.
fn sorted(counts: &BTreeMap<String, u64>) -> Vec<(&str, u64)> {
    let mut entries: Vec<(&str, u64)> = counts
        .iter()
        .map(|(name, count)| (name.as_str(), *count))
        .collect();
    entries.sort_by(|(left, _), (right, _)| {
        left.to_lowercase()
            .cmp(&right.to_lowercase())
            .then_with(|| left.cmp(right))
    });
    entries
}
