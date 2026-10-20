//! Corpus test: this repository's active changes all read into a schedule.
//!
//! It reads the live change folders outside this crate, so it is a corpus test
//! (rust-core "Corpus tests"): it carries the corpus ignore, runs under
//! `scripts/verify-rust.sh`, and cargo-mutants leaves it out.

use std::path::Path;

use osq_core::ScheduleState;
use osq_kernel_loop::{ActiveState, active_schedule};
use osq_kernel_storage::{Location, list_changes};

/// Covers: rust-loop/active-schedule-of-this-repository
#[test]
#[ignore = "corpus test: reads this repository's change folders"]
fn active_schedule_of_this_repository() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/loop");
    let schedule = active_schedule(root).expect("the active changes read");
    let folders: Vec<String> = list_changes(root)
        .into_iter()
        .filter(|entry| entry.location == Location::Active)
        .map(|entry| entry.folder)
        .collect();
    assert_eq!(schedule.changes.len(), folders.len());
    for (change, folder) in schedule.changes.iter().zip(folders) {
        assert_eq!(change.folder, folder);
    }
    for id in &schedule.start {
        let change = schedule
            .changes
            .iter()
            .find(|change| change.id == *id)
            .expect("a started id names an active change");
        assert_eq!(change.state, ActiveState::Queued(ScheduleState::Ready));
    }
}
