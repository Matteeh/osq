//! Writing report counts as TypeScript's text or its sorted JSON members.
//!
//! Implements: rust-report/report-summary

use super::counts::Counts;
use super::history::History;
use super::{history_json, history_text};

/// Writes the header, `Specs Summary:`, `Now:` and `History:` sections.
///
/// Implements: rust-report/report-summary
/// Implements: rust-report/report-history
pub(crate) fn text(counts: &Counts, history: &History) -> String {
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
            "  Completion rate: {rate}%\n",
            "\n",
            "History:\n",
            "{history}",
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
        history = history_text::text(history),
    )
}

/// Writes the `completionRate`, `history`, `now` and `specs` members as JSON.
///
/// Implements: rust-report/report-summary
/// Implements: rust-report/report-history
pub(crate) fn json(counts: &Counts, history: &History) -> String {
    history_json::document(counts, history)
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
