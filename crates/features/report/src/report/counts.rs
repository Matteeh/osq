//! Counting the spec, task and completion figures TypeScript's report counts.
//!
//! Implements: rust-report/report-counts

use osq_kernel_storage::{ChangeEntry, Location, read_now_facts};

/// Every figure one report prints.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Counts {
    /// Active and archived change folders together.
    pub(crate) total_specs: u64,
    /// Change folders directly under `openspec/changes/`.
    pub(crate) active_specs: u64,
    /// Change folders under `openspec/changes/archive/`.
    pub(crate) archived_specs: u64,
    /// Every task of every counted change.
    pub(crate) total_tasks: u64,
    /// Tasks whose status is `done`.
    pub(crate) done: u64,
    /// Done tasks without a manual marker.
    pub(crate) verified: u64,
    /// Done tasks whose marker says `manual: true`.
    pub(crate) manual: u64,
    /// Tasks whose status is `dead`.
    pub(crate) dead: u64,
    /// Tasks whose status is `regressed`.
    pub(crate) regressed: u64,
    /// Tasks whose status is `running`.
    pub(crate) running: u64,
    /// Pending tasks of active changes.
    pub(crate) pending: u64,
    /// Pending tasks of archived changes.
    pub(crate) unmarked: u64,
    /// The completion rate in hundredths of a percent.
    pub(crate) completion: u64,
}

/// Counts every non-rejected change entry and its tasks.
///
/// Implements: rust-report/report-counts
pub(crate) fn count(entries: &[ChangeEntry]) -> Counts {
    let mut counts = Counts::default();
    for entry in entries {
        if entry.location == Location::Rejected {
            continue;
        }
        let archived = entry.location == Location::Archived;
        if archived {
            counts.archived_specs += 1;
        } else {
            counts.active_specs += 1;
        }
        add_tasks(&mut counts, entry, archived);
    }
    counts.total_specs = counts.active_specs + counts.archived_specs;
    counts.completion = completion_hundredths(counts.done, counts.total_tasks);
    counts
}

/// Adds one change folder's tasks to the counts.
fn add_tasks(counts: &mut Counts, entry: &ChangeEntry, archived: bool) {
    let facts = read_now_facts(&entry.path);
    for task in &facts.tasks {
        counts.total_tasks += 1;
        if !facts.has_proposal {
            add_pending(counts, archived);
        } else if task.regressed {
            counts.regressed += 1;
        } else if task.done {
            counts.done += 1;
            if task.manual {
                counts.manual += 1;
            } else {
                counts.verified += 1;
            }
        } else if task.dead {
            counts.dead += 1;
        } else if task.running {
            counts.running += 1;
        } else {
            add_pending(counts, archived);
        }
    }
}

/// Adds one pending task as pending or unmarked for its change's place.
fn add_pending(counts: &mut Counts, archived: bool) {
    if archived {
        counts.unmarked += 1;
    } else {
        counts.pending += 1;
    }
}

/// JavaScript's `Math.round(done / total * 10000)`, in hundredths, or 0.
fn completion_hundredths(done: u64, total: u64) -> u64 {
    if total == 0 {
        return 0;
    }
    (done * 20_000 + total) / (total * 2)
}
