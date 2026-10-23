//! Writing report counts as TypeScript's text or its sorted JSON members.
//!
//! Implements: rust-report/report-summary

use super::counts::Counts;

/// Writes the header, `Specs Summary:` and `Now:` sections TypeScript prints.
///
/// Implements: rust-report/report-summary
pub(crate) fn text(counts: &Counts) -> String {
    format!(
        concat!(
            "osq Delivery Metrics Report\n",
            "\n",
            "Specs Summary:\n",
            "  Total specs: {total_specs} ({active_specs} active, {archived_specs} archived)\n",
            "\n",
            "Now:\n",
            "  Total tasks: {total_tasks}\n",
            "  Done: {done}\n",
            "  Verified done: {verified}\n",
            "  Manual done: {manual}\n",
            "  Dead: {dead}\n",
            "  Regressed: {regressed}\n",
            "  Running: {running}\n",
            "  Pending: {pending}\n",
            "  Unmarked: {unmarked}\n",
            "  Completion rate: {rate}%",
        ),
        total_specs = counts.total_specs,
        active_specs = counts.active_specs,
        archived_specs = counts.archived_specs,
        total_tasks = counts.total_tasks,
        done = counts.done,
        verified = counts.verified,
        manual = counts.manual,
        dead = counts.dead,
        regressed = counts.regressed,
        running = counts.running,
        pending = counts.pending,
        unmarked = counts.unmarked,
        rate = rate(counts.completion),
    )
}

/// Writes the `completionRate`, `now` and `specs` members as sorted JSON.
///
/// Implements: rust-report/report-summary
pub(crate) fn json(counts: &Counts) -> String {
    format!(
        concat!(
            "{{\n",
            "  \"completionRate\": {rate},\n",
            "  \"now\": {{\n",
            "    \"dead\": {dead},\n",
            "    \"done\": {done},\n",
            "    \"manual\": {manual},\n",
            "    \"pending\": {pending},\n",
            "    \"regressed\": {regressed},\n",
            "    \"running\": {running},\n",
            "    \"total\": {total_tasks},\n",
            "    \"unmarked\": {unmarked},\n",
            "    \"verified\": {verified}\n",
            "  }},\n",
            "  \"specs\": {{\n",
            "    \"active\": {active_specs},\n",
            "    \"archived\": {archived_specs},\n",
            "    \"total\": {total_specs}\n",
            "  }}\n",
            "}}",
        ),
        rate = rate(counts.completion),
        dead = counts.dead,
        done = counts.done,
        manual = counts.manual,
        pending = counts.pending,
        regressed = counts.regressed,
        running = counts.running,
        total_tasks = counts.total_tasks,
        unmarked = counts.unmarked,
        verified = counts.verified,
        active_specs = counts.active_specs,
        archived_specs = counts.archived_specs,
        total_specs = counts.total_specs,
    )
}

/// Writes hundredths of a percent as JavaScript writes the same number.
fn rate(hundredths: u64) -> String {
    let whole = hundredths / 100;
    let fraction = hundredths % 100;
    if fraction == 0 {
        return whole.to_string();
    }
    if fraction % 10 == 0 {
        return format!("{whole}.{}", fraction / 10);
    }
    format!("{whole}.{fraction:02}")
}
