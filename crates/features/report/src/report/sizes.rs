//! Measuring task sizes and bucketing them by scope files and acceptance lines.
//!
//! Implements: rust-report/report-sizes

use std::cmp::Ordering;

use osq_kernel_storage::{ChangeEntry, Location, ScopeResolver, TaskSize, read_task_sizes};
use serde_json::{Value, json};

use super::js_number;
use super::order::compare_numeric_prefix;

/// The bucket labels in TypeScript's order.
const BUCKETS: [&str; 4] = ["1-2", "3-4", "5-8", "over-8"];

/// The measured tasks' buckets by acceptance lines and scope-file resolver.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SizeMetrics {
    /// Every measured task's rows by acceptance lines.
    pub(crate) by_acceptance_lines: Vec<SizeBucketRow>,
    /// The legacy series, then the resolver-2 series.
    pub(crate) scope_file_series: Vec<ScopeFileSeries>,
}

/// One ordered size bucket with first-attempt outcome aggregates.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SizeBucketRow {
    /// The bucket's label.
    pub(crate) bucket: &'static str,
    /// The number of tasks in the bucket.
    pub(crate) tasks: usize,
    /// The share whose first attempt passed, rounded to two decimals.
    pub(crate) first_attempt_pass_rate: f64,
    /// The mean attempts, rounded to two decimals.
    pub(crate) mean_attempts: f64,
    /// The median known duration in seconds, rounded to two decimals.
    pub(crate) median_duration_seconds: Option<f64>,
}

/// Size-against-outcome evidence for one scope-file resolver generation.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ScopeFileSeries {
    /// `legacy` or `resolver-2`.
    pub(crate) resolver: &'static str,
    /// The least change of its tasks, or none for legacy and without tasks.
    pub(crate) starts_at_change: Option<String>,
    /// Its rows by scope files.
    pub(crate) by_scope_files: Vec<SizeBucketRow>,
    /// Its passing task with the most scope files, then acceptance lines.
    pub(crate) largest_first_attempt_pass: Option<LargestFirstAttemptPass>,
}

/// The first-attempt pass with the greatest observed scope size.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct LargestFirstAttemptPass {
    /// The change folder name.
    pub(crate) change: String,
    /// The task id.
    pub(crate) task: String,
    /// The task file's title.
    pub(crate) title: String,
    /// The number of scope files.
    pub(crate) scope_files: f64,
    /// The number of acceptance lines.
    pub(crate) acceptance_lines: usize,
}

/// One measured task and the change folder it belongs to.
struct MeasuredTask {
    /// The change's folder name.
    change: String,
    /// The storage reader's task size.
    size: TaskSize,
}

/// Reads every non-rejected change's measured tasks into the size metrics.
///
/// Implements: rust-report/report-sizes
pub(crate) fn read(entries: &[ChangeEntry]) -> SizeMetrics {
    let mut tasks = Vec::new();
    for entry in entries {
        if entry.location == Location::Rejected {
            continue;
        }
        for size in read_task_sizes(&entry.path) {
            tasks.push(MeasuredTask {
                change: entry.folder.clone(),
                size,
            });
        }
    }
    let all: Vec<&MeasuredTask> = tasks.iter().collect();
    let legacy: Vec<&MeasuredTask> = all
        .iter()
        .copied()
        .filter(|task| task.size.resolver == ScopeResolver::Legacy)
        .collect();
    let second: Vec<&MeasuredTask> = all
        .iter()
        .copied()
        .filter(|task| task.size.resolver == ScopeResolver::Second)
        .collect();
    SizeMetrics {
        by_acceptance_lines: aggregate(&all, acceptance_lines),
        scope_file_series: vec![series(&legacy, "legacy"), series(&second, "resolver-2")],
    }
}

/// The number of scope files as a float.
fn scope_files(size: &TaskSize) -> f64 {
    size.scope_files
}

/// The number of acceptance lines as a float.
fn acceptance_lines(size: &TaskSize) -> f64 {
    whole(size.acceptance_lines)
}

/// One resolver generation's bucket rows and largest first-attempt pass.
fn series(tasks: &[&MeasuredTask], resolver: &'static str) -> ScopeFileSeries {
    ScopeFileSeries {
        resolver,
        starts_at_change: if resolver == "resolver-2" {
            earliest_change(tasks)
        } else {
            None
        },
        by_scope_files: aggregate(tasks, scope_files),
        largest_first_attempt_pass: largest_first_attempt_pass(tasks),
    }
}

/// The four ordered bucket rows for one size key.
fn aggregate(tasks: &[&MeasuredTask], key: fn(&TaskSize) -> f64) -> Vec<SizeBucketRow> {
    BUCKETS
        .iter()
        .map(|bucket| row(tasks, key, bucket))
        .collect()
}

/// One bucket's task count, pass share, mean attempts and median duration.
fn row(tasks: &[&MeasuredTask], key: fn(&TaskSize) -> f64, bucket: &'static str) -> SizeBucketRow {
    let rows: Vec<&&MeasuredTask> = tasks
        .iter()
        .filter(|task| bucket_for_size(key(&task.size)) == bucket)
        .collect();
    let count = rows.len();
    let passed = rows
        .iter()
        .filter(|task| task.size.first_attempt_pass)
        .count();
    let attempts: f64 = rows.iter().map(|task| whole_u64(task.size.attempts)).sum();
    let mut durations: Vec<f64> = rows
        .iter()
        .filter_map(|task| task.size.duration_ms)
        .map(duration_seconds)
        .collect();
    SizeBucketRow {
        bucket,
        tasks: count,
        first_attempt_pass_rate: if count > 0 {
            round2(whole(passed) / whole(count))
        } else {
            0.0
        },
        mean_attempts: if count > 0 {
            round2(attempts / whole(count))
        } else {
            0.0
        },
        median_duration_seconds: median_seconds(&mut durations),
    }
}

/// The ordered bucket label for one size.
fn bucket_for_size(value: f64) -> &'static str {
    if value <= 2.0 {
        "1-2"
    } else if value <= 4.0 {
        "3-4"
    } else if value <= 8.0 {
        "5-8"
    } else {
        "over-8"
    }
}

/// JavaScript's `Math.round(value * 100) / 100`.
fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// The sorted median rounded to two decimals, or none without a value.
fn median_seconds(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    let median = if values.len() % 2 == 0 {
        f64::midpoint(values[middle - 1], values[middle])
    } else {
        values[middle]
    };
    Some(round2(median))
}

/// One task's known duration in seconds.
fn duration_seconds(milliseconds: i64) -> f64 {
    let magnitude = u32::try_from(milliseconds.unsigned_abs()).unwrap_or(u32::MAX);
    f64::from(magnitude) / 1000.0
}

/// The least change of a series, or none without a task.
fn earliest_change(tasks: &[&MeasuredTask]) -> Option<String> {
    let mut earliest: Option<&str> = None;
    for task in tasks {
        let change = task.change.as_str();
        if earliest.is_none_or(|current| compare_numeric_prefix(change, current) == Ordering::Less)
        {
            earliest = Some(change);
        }
    }
    earliest.map(str::to_owned)
}

/// The passing task with the most scope files, then acceptance lines, then id.
fn largest_first_attempt_pass(tasks: &[&MeasuredTask]) -> Option<LargestFirstAttemptPass> {
    let mut passing: Vec<&MeasuredTask> = tasks
        .iter()
        .copied()
        .filter(|task| task.size.first_attempt_pass)
        .collect();
    passing.sort_by(|left, right| {
        right
            .size
            .scope_files
            .total_cmp(&left.size.scope_files)
            .then_with(|| right.size.acceptance_lines.cmp(&left.size.acceptance_lines))
            .then_with(|| compare_numeric_prefix(&left.change, &right.change))
            .then_with(|| compare_numeric_prefix(&left.size.task, &right.size.task))
    });
    let top = passing.first()?;
    Some(LargestFirstAttemptPass {
        change: top.change.clone(),
        task: top.size.task.clone(),
        title: top.size.title.clone(),
        scope_files: top.size.scope_files,
        acceptance_lines: top.size.acceptance_lines,
    })
}

/// The sizes' JSON member as `serializeSortedJson` writes it.
///
/// Implements: rust-report/report-sizes
pub(crate) fn json(metrics: &SizeMetrics) -> Value {
    let series: Vec<Value> = metrics
        .scope_file_series
        .iter()
        .map(|entry| {
            json!({
                "resolver": entry.resolver,
                "startsAtChange": entry.starts_at_change,
                "byScopeFiles": rows_json(&entry.by_scope_files),
                "largestFirstAttemptPass": entry.largest_first_attempt_pass.as_ref().map_or(Value::Null, largest_json),
            })
        })
        .collect();
    json!({
        "byAcceptanceLines": rows_json(&metrics.by_acceptance_lines),
        "scopeFileSeries": series,
    })
}

/// One bucket table's rows as JSON objects.
fn rows_json(rows: &[SizeBucketRow]) -> Vec<Value> {
    rows.iter()
        .map(|row| {
            json!({
                "bucket": row.bucket,
                "tasks": row.tasks,
                "firstAttemptPassRate": js_number::json_number(row.first_attempt_pass_rate),
                "meanAttempts": js_number::json_number(row.mean_attempts),
                "medianDurationSeconds": row.median_duration_seconds.map_or(Value::Null, js_number::json_number),
            })
        })
        .collect()
}

/// One largest first-attempt pass as a JSON object.
fn largest_json(pass: &LargestFirstAttemptPass) -> Value {
    json!({
        "change": pass.change,
        "task": pass.task,
        "title": pass.title,
        "scopeFiles": js_number::json_number(pass.scope_files),
        "acceptanceLines": pass.acceptance_lines,
    })
}

/// A count as a float.
fn whole(value: usize) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}

/// A count as a float.
fn whole_u64(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}
