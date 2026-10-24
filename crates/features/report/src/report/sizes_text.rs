//! Writing the size tables, the resolver-2 start and the size hint.
//!
//! Implements: rust-report/report-sizes

use osq_kernel_config::Limits;

use super::js_number;
use super::sizes::{LargestFirstAttemptPass, ScopeFileSeries, SizeBucketRow, SizeMetrics};

/// The size table's header line.
const HEADER: &str =
    "    bucket     tasks  first-attempt pass rate  mean attempts  median duration";

/// Writes the size tables, the resolver-2 start and the size hint.
///
/// Implements: rust-report/report-sizes
pub(crate) fn text(metrics: &SizeMetrics, limits: &Limits) -> Vec<String> {
    let mut lines = Vec::new();
    let legacy = series(metrics, "legacy");
    let second = series(metrics, "resolver-2");
    append_table(
        &mut lines,
        "  Size by scope files (legacy):",
        &legacy.by_scope_files,
    );
    append_table(
        &mut lines,
        "  Size by scope files (resolver-2):",
        &second.by_scope_files,
    );
    let starts = second.starts_at_change.as_deref().unwrap_or("unavailable");
    lines.push(format!("  Resolver 2 starts at: {starts}"));
    append_table(
        &mut lines,
        "  Size by acceptance lines:",
        &metrics.by_acceptance_lines,
    );
    if let Some(hint) = hint(metrics, limits) {
        lines.push(hint);
    }
    lines
}

/// One named resolver series.
fn series<'a>(metrics: &'a SizeMetrics, resolver: &str) -> &'a ScopeFileSeries {
    metrics
        .scope_file_series
        .iter()
        .find(|entry| entry.resolver == resolver)
        .expect("the size metrics hold both series")
}

/// Appends one titled size table.
fn append_table(lines: &mut Vec<String>, title: &str, rows: &[SizeBucketRow]) {
    lines.push(title.to_owned());
    lines.push(HEADER.to_owned());
    for row in rows {
        lines.push(row_line(row));
    }
}

/// Writes one bucket row with TypeScript's padding.
fn row_line(row: &SizeBucketRow) -> String {
    let median = row.median_duration_seconds.map_or_else(
        || "unavailable".to_owned(),
        |seconds| format_duration(seconds * 1000.0),
    );
    format!(
        "    {:<10} {:<6} {:<23} {:<14} {median}",
        row.bucket,
        row.tasks.to_string(),
        js_number::number(row.first_attempt_pass_rate),
        js_number::number(row.mean_attempts),
    )
}

/// Writes milliseconds as TypeScript's `formatDuration` writes them.
fn format_duration(milliseconds: f64) -> String {
    let rounded = (milliseconds / 1000.0).round();
    if rounded < 60.0 {
        return format!("{}s", js_number::number(rounded));
    }
    let minutes = (rounded / 60.0).floor();
    let seconds = rounded % 60.0;
    if seconds > 0.0 {
        format!(
            "{}m {}s",
            js_number::number(minutes),
            js_number::number(seconds)
        )
    } else {
        format!("{}m", js_number::number(minutes))
    }
}

/// The hint line when a limit is within one of the hint series' largest pass.
fn hint(metrics: &SizeMetrics, limits: &Limits) -> Option<String> {
    let hint_series = hint_series(metrics);
    let pass = hint_series.largest_first_attempt_pass.as_ref()?;
    let mut parts = Vec::new();
    add_scope_part(&mut parts, pass, limits);
    add_acceptance_part(&mut parts, pass, limits);
    if parts.is_empty() {
        return None;
    }
    Some(format!(
        "  Size hint: largest first-attempt pass {}/{} — {}",
        pass.change,
        pass.task,
        parts.join("; ")
    ))
}

/// The resolver-2 series when any of its rows has a task, else the legacy one.
fn hint_series(metrics: &SizeMetrics) -> &ScopeFileSeries {
    let second = series(metrics, "resolver-2");
    if second.by_scope_files.iter().any(|row| row.tasks > 0) {
        return second;
    }
    series(metrics, "legacy")
}

/// Adds the scope-files hint part when its limit is within one.
fn add_scope_part(parts: &mut Vec<String>, pass: &LargestFirstAttemptPass, limits: &Limits) {
    let limit = limits.max_scope_files;
    if within_one(pass.scope_files, limit) {
        parts.push(format!(
            "scope files {} is within 1 of configured maxScopeFiles {limit}",
            js_number::number(pass.scope_files)
        ));
    }
}

/// Adds the acceptance-lines hint part when its limit is within one.
fn add_acceptance_part(parts: &mut Vec<String>, pass: &LargestFirstAttemptPass, limits: &Limits) {
    let limit = limits.max_acceptance_lines;
    if within_one_usize(pass.acceptance_lines, limit) {
        parts.push(format!(
            "acceptance lines {} is within 1 of configured maxAcceptanceLines {limit}",
            pass.acceptance_lines
        ));
    }
}

/// Whether a scope size is within one of a configured limit.
fn within_one(value: f64, limit: u64) -> bool {
    (value - whole(limit)).abs() <= 1.0
}

/// Whether an acceptance count is within one of a configured limit.
fn within_one_usize(value: usize, limit: u64) -> bool {
    u64::try_from(value).is_ok_and(|count| count.abs_diff(limit) <= 1)
}

/// A scope-size count as a float.
fn whole(value: u64) -> f64 {
    f64::from(u32::try_from(value).unwrap_or(u32::MAX))
}
