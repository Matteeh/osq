//! Writing the report's `history` member as `serializeSortedJson` writes it.
//!
//! Implements: rust-report/report-history

use std::collections::BTreeMap;

use osq_kernel_storage::{RetryGroup, StartCount};
use serde_json::{Map, Value, json};

use crate::query::json::real_text;

use super::counts::Counts;
use super::history::History;

/// Writes the `completionRate`, `history`, `now` and `specs` members as JSON.
///
/// Implements: rust-report/report-summary
/// Implements: rust-report/report-history
pub(crate) fn document(counts: &Counts, history: &History) -> String {
    let rate =
        f64::from(u32::try_from(counts.completion).expect("a completion rate fits in a u32"));
    let report = json!({
        "completionRate": number(rate / 100.0),
        "history": value(history),
        "now": {
            "dead": counts.dead,
            "done": counts.done,
            "manual": counts.manual,
            "pending": counts.pending,
            "regressed": counts.regressed,
            "running": counts.running,
            "total": counts.total_tasks,
            "unmarked": counts.unmarked,
            "verified": counts.verified,
        },
        "specs": {
            "active": counts.active_specs,
            "archived": counts.archived_specs,
            "total": counts.total_specs,
        },
    });
    serde_json::to_string_pretty(&report).expect("a report JSON value writes")
}

/// Writes the nine `history` members this change ports.
fn value(history: &History) -> Value {
    json!({
        "attempts": {
            "byTask": count_map(&history.attempts_by_task),
            "multipleAttempts": history.multiple_attempts,
            "total": history.attempts_total,
        },
        "cost": {
            "coverage": {
                "reportedAttempts": history.cost_reported_attempts,
                "totalAttempts": history.attempts_total,
            },
            "formattedTotal": history.formatted_total,
            "perSpec": cost_map(&history.cost_per_spec),
            "provenance": "harness-reported",
            "total": number(history.cost_total),
        },
        "deadByReason": count_map(&history.dead_by_reason),
        "preSpawnVerify": {
            "byStart": {
                "any": start(&history.pre_spawn.any),
                "green": start(&history.pre_spawn.green),
                "red": start(&history.pre_spawn.red),
            },
            "mismatchedTasks": history.pre_spawn_mismatched_tasks,
            "mismatches": history.pre_spawn.mismatches,
            "missingPathRuns": history.pre_spawn.missing_path_runs,
            "runs": history.pre_spawn.runs,
        },
        "rejections": {
            "byPlannerModel": count_map(&history.rejections_by_planner),
            "total": history.rejections_total,
        },
        "retries": {
            "automatic": group(&history.retries.automatic),
            "manual": group(&history.retries.manual),
            "stuck": history.retries.stuck,
        },
        "scopeRegressions": {
            "detected": history.scope.detected,
            "recertifiedAutomatically": history.scope.recertified_automatically,
            "recertifiedByHuman": history.scope.recertified_by_human,
            "requeuedForAgent": history.scope.requeued_for_agent,
            "verificationFailedAtDetection": history.scope.failed_at_detection,
            "verificationPassedAtDetection": history.scope.passed_at_detection,
        },
        "unexplainedReruns": {
            "byTask": count_map(&history.unexplained_by_task),
            "total": history.unexplained_total,
        },
        "verifyRuns": {
            "byTask": codes_map(&history.verify_by_task),
            "missingExitCode": history.verify_missing_exit_code,
            "total": history.verify_total,
        },
    })
}

/// Writes one counts table as a JSON object.
fn count_map(counts: &BTreeMap<String, u64>) -> Value {
    let mut map = Map::new();
    for (name, count) in counts {
        map.insert(name.clone(), Value::from(*count));
    }
    Value::Object(map)
}

/// Writes one cost table as a JSON object.
fn cost_map(costs: &BTreeMap<String, f64>) -> Value {
    let mut map = Map::new();
    for (name, cost) in costs {
        map.insert(name.clone(), number(*cost));
    }
    Value::Object(map)
}

/// Writes one verification-code table as a JSON object.
fn codes_map(codes: &BTreeMap<String, Vec<Option<f64>>>) -> Value {
    let mut map = Map::new();
    for (task, values) in codes {
        map.insert(task.clone(), codes_value(values));
    }
    Value::Object(map)
}

/// Writes one task's verification codes, with `null` for a missing one.
fn codes_value(codes: &[Option<f64>]) -> Value {
    Value::Array(
        codes
            .iter()
            .map(|code| code.map_or(Value::Null, number))
            .collect(),
    )
}

/// Writes one retry group as a JSON object.
fn group(group: &RetryGroup) -> Value {
    json!({
        "cost": number(group.cost),
        "costReportedAttempts": group.cost_reported_attempts,
        "count": group.count,
        "reachedDone": group.reached_done,
    })
}

/// Writes one declared start's runs and passes as a JSON object.
fn start(start: &StartCount) -> Value {
    json!({
        "passed": start.passed,
        "runs": start.runs,
    })
}

/// One number as JavaScript's `Number::toString` writes it.
fn number(value: f64) -> Value {
    serde_json::from_str(&real_text(value)).expect("a JavaScript number is JSON")
}
