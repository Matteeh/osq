//! Proves scheduling is deterministic and never starts an overlap or an unmet
//! dependency.

use std::collections::BTreeSet;

use osq_core::{
    Dependency, QueuedChange, RunningChange, Schedule, ScheduleState, lock_unit, schedule,
};
use proptest::prelude::*;

/// The small id pool shared by queued, running and dependency ids.
const IDS: [&str; 6] = ["1", "2", "3", "4", "5", "6"];

/// The small file pool, with files that share and do not share lock units.
const FILES: [&str; 10] = [
    "src/a.ts",
    "src/b.ts",
    "src/c.ts",
    "crates/core/src/lib.rs",
    "crates/core/Cargo.toml",
    "crates/kernel/specs/src/lib.rs",
    "crates/kernel/specs/tests/parse.rs",
    "crates/kernel/linter/src/lib.rs",
    "crates/features/run/src/lib.rs",
    "crates/features/web/src/lib.rs",
];

/// Picks an id from the pool.
fn picked_id() -> impl Strategy<Value = String> {
    prop::sample::select(&IDS).prop_map(str::to_owned)
}

/// Picks up to four files from the pool.
fn picked_files() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec(prop::sample::select(&FILES).prop_map(str::to_owned), 0..=4)
}

/// Generates up to three dependencies.
fn dependencies() -> impl Strategy<Value = Vec<Dependency>> {
    prop::collection::vec((picked_id(), any::<bool>()), 0..=3).prop_map(|pairs| {
        pairs
            .into_iter()
            .map(|(id, done)| Dependency { id, done })
            .collect()
    })
}

/// Generates one queued change.
fn queued_change() -> impl Strategy<Value = QueuedChange> {
    (picked_id(), any::<bool>(), dependencies(), picked_files()).prop_map(
        |(id, approved, dependencies, files)| QueuedChange {
            id,
            approved,
            dependencies,
            files,
        },
    )
}

/// Generates one running change.
fn running_change() -> impl Strategy<Value = RunningChange> {
    (picked_id(), picked_files()).prop_map(|(id, files)| RunningChange { id, files })
}

/// Generates a queue of up to eight changes and up to three running changes.
fn scheduling_case() -> impl Strategy<Value = (Vec<QueuedChange>, Vec<RunningChange>)> {
    (
        prop::collection::vec(queued_change(), 0..=8),
        prop::collection::vec(running_change(), 0..=3),
    )
}

/// The distinct lock units of a file list.
fn units(files: &[String]) -> BTreeSet<String> {
    files.iter().map(|file| lock_unit(file)).collect()
}

/// Whether two file lists share at least one lock unit.
fn overlaps(left: &[String], right: &[String]) -> bool {
    !units(left).is_disjoint(&units(right))
}

/// The queued changes this result made ready, with their own files.
fn started<'a>(
    queue: &'a [QueuedChange],
    running: &[RunningChange],
    result: &Schedule,
) -> Vec<&'a QueuedChange> {
    let running_ids: BTreeSet<&str> = running.iter().map(|change| change.id.as_str()).collect();
    let mut state_index = 0;
    let mut changes = Vec::new();
    for change in queue {
        if running_ids.contains(change.id.as_str()) {
            continue;
        }
        let state = &result.states[state_index].state;
        state_index += 1;
        if *state == ScheduleState::Ready {
            changes.push(change);
        }
    }
    assert_eq!(state_index, result.states.len());
    changes
}

proptest! {
    /// Proves two runs on the same input give the same schedule.
    ///
    /// Covers: rust-core/scheduling-is-deterministic
    #[test]
    fn scheduling_is_deterministic((queue, running) in scheduling_case()) {
        prop_assert_eq!(schedule(&queue, &running), schedule(&queue, &running));
    }

    /// Proves no two started changes overlap, and no started change overlaps a
    /// running change, while running changes may overlap each other.
    ///
    /// Covers: rust-core/started-and-running-changes-never-overlap
    #[test]
    fn started_and_running_changes_never_overlap((queue, running) in scheduling_case()) {
        let result = schedule(&queue, &running);
        let started = started(&queue, &running, &result);
        let ids: Vec<String> = started.iter().map(|change| change.id.clone()).collect();
        prop_assert_eq!(&result.start, &ids);
        for (index, left) in started.iter().enumerate() {
            for right in &started[index + 1..] {
                prop_assert!(
                    !overlaps(&left.files, &right.files),
                    "started {} overlaps started {}",
                    left.id,
                    right.id
                );
            }
            for other in &running {
                prop_assert!(
                    !overlaps(&left.files, &other.files),
                    "started {} overlaps running {}",
                    left.id,
                    other.id
                );
            }
        }
    }

    /// Proves every started change is approved and has every dependency done.
    ///
    /// Covers: rust-core/an-unmet-dependency-never-starts
    #[test]
    fn an_unmet_dependency_never_starts((queue, running) in scheduling_case()) {
        let result = schedule(&queue, &running);
        let started = started(&queue, &running, &result);
        let ids: Vec<String> = started.iter().map(|change| change.id.clone()).collect();
        prop_assert_eq!(&result.start, &ids);
        for change in started {
            prop_assert!(change.approved, "{} started unapproved", change.id);
            for dependency in &change.dependencies {
                prop_assert!(
                    dependency.done,
                    "{} started with dependency {} not done",
                    change.id,
                    dependency.id
                );
            }
        }
    }
}
