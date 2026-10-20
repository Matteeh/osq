//! Proves the scheduler's lock units, state table and overlap rules.

use osq_core::{
    Dependency, QueuedChange, RunningChange, ScheduleState, ScheduledChange, lock_unit, schedule,
};

/// Builds one dependency.
fn dependency(id: &str, done: bool) -> Dependency {
    Dependency {
        id: id.to_owned(),
        done,
    }
}

/// Builds one queued change with dependencies as id and done pairs.
fn queued(id: &str, approved: bool, dependencies: &[(&str, bool)], files: &[&str]) -> QueuedChange {
    QueuedChange {
        id: id.to_owned(),
        approved,
        dependencies: dependencies
            .iter()
            .map(|(id, done)| dependency(id, *done))
            .collect(),
        files: files.iter().map(|file| (*file).to_owned()).collect(),
    }
}

/// Builds one running change.
fn running(id: &str, files: &[&str]) -> RunningChange {
    RunningChange {
        id: id.to_owned(),
        files: files.iter().map(|file| (*file).to_owned()).collect(),
    }
}

/// Asserts the scheduled change's id, literal state and displayed reason.
fn assert_state(scheduled: &ScheduledChange, id: &str, state: &ScheduleState, display: &str) {
    assert_eq!(scheduled.id, id);
    assert_eq!(scheduled.state, *state);
    assert_eq!(scheduled.state.to_string(), display);
}

/// Proves every row of "Lock unit of a path".
///
/// Covers: rust-core/lock-unit-of-a-path
#[test]
fn lock_unit_of_a_path() {
    let cases = [
        ("src/a.ts", "src/a.ts"),
        ("crates/core/src/lib.rs", "crates/core"),
        ("crates/core/Cargo.toml", "crates/core"),
        ("crates/kernel/specs/src/lib.rs", "crates/kernel/specs"),
        ("crates/kernel/specs/tests/parse.rs", "crates/kernel/specs"),
        ("crates/kernel/README.md", "crates/kernel/README.md"),
        (
            "crates/features/run/src/lib.rs",
            "crates/features/run/src/lib.rs",
        ),
        ("crates/corex/a.rs", "crates/corex/a.rs"),
    ];
    for (path, unit) in cases {
        assert_eq!(lock_unit(path), unit, "{path}");
    }
}

/// Proves every state, overlap rule and start row of "Every state and overlap
/// rule".
///
/// Covers: rust-core/every-state-and-overlap-rule
#[test]
fn every_state_and_overlap_rule() {
    let queue = [
        queued("201", false, &[], &["src/x.ts"]),
        queued(
            "202",
            true,
            &[("150", true), ("151", false), ("152", false)],
            &["src/y.ts"],
        ),
        queued("203", true, &[("150", true)], &["src/a.ts", "src/b.ts"]),
        queued("204", true, &[], &["crates/kernel/specs/src/lib.rs"]),
        queued("205", true, &[], &["crates/kernel/specs/tests/parse.rs"]),
        queued("206", true, &[], &["crates/core/src/lib.rs", "src/b.ts"]),
        queued("207", true, &[], &["crates/core/Cargo.toml", "src/b.ts"]),
        queued("300", true, &[], &["src/z.ts"]),
    ];
    let running = [running("300", &["src/a.ts"])];

    let result = schedule(&queue, &running);

    let expected = [
        ("201", ScheduleState::NeedsApproval, "needs approval"),
        (
            "202",
            ScheduleState::WaitingOn("151".to_owned()),
            "waiting on 151",
        ),
        (
            "203",
            ScheduleState::BlockedBy {
                id: "300".to_owned(),
                shared: vec!["src/a.ts".to_owned()],
            },
            "blocked by 300: src/a.ts",
        ),
        ("204", ScheduleState::Ready, "ready"),
        (
            "205",
            ScheduleState::BlockedBy {
                id: "204".to_owned(),
                shared: vec!["crates/kernel/specs".to_owned()],
            },
            "blocked by 204: crates/kernel/specs",
        ),
        ("206", ScheduleState::Ready, "ready"),
        (
            "207",
            ScheduleState::BlockedBy {
                id: "206".to_owned(),
                shared: vec!["crates/core".to_owned(), "src/b.ts".to_owned()],
            },
            "blocked by 206: crates/core, src/b.ts",
        ),
    ];
    assert_eq!(result.states.len(), expected.len());
    for (scheduled, (id, state, display)) in result.states.iter().zip(expected) {
        assert_state(scheduled, id, &state, display);
    }
    assert_eq!(result.start, ["204", "206"]);
}

/// Proves a running change before a change started in the same call is the
/// blocker, and that running order wins before queue order.
///
/// Covers: rust-core/running-changes-come-first
#[test]
fn running_changes_come_first() {
    let queue = [queued("210", true, &[], &["src/b.ts", "src/a.ts"])];
    let running = [running("300", &["src/a.ts"]), running("301", &["src/b.ts"])];

    let result = schedule(&queue, &running);

    assert_eq!(result.start, Vec::<String>::new());
    assert_eq!(result.states.len(), 1);
    assert_state(
        &result.states[0],
        "210",
        &ScheduleState::BlockedBy {
            id: "300".to_owned(),
            shared: vec!["src/a.ts".to_owned()],
        },
        "blocked by 300: src/a.ts",
    );
}

/// Proves the state order: approval, then dependencies, then running changes,
/// then changes started earlier in the call.
///
/// Covers: rust-core/every-state-and-overlap-rule
#[test]
fn state_order_is_approval_dependency_running_then_started() {
    let queue = [
        queued("401", false, &[("150", false)], &["src/a.ts"]),
        queued("402", true, &[("150", false)], &["src/a.ts"]),
        queued("403", true, &[("150", true)], &["crates/core/a.rs"]),
        queued(
            "404",
            true,
            &[("150", true)],
            &["crates/core/b.rs", "src/r.ts"],
        ),
        queued("405", true, &[("150", true)], &["crates/core/c.rs"]),
    ];
    let running = [running("400", &["src/r.ts"])];

    let result = schedule(&queue, &running);

    let expected = [
        ("401", ScheduleState::NeedsApproval, "needs approval"),
        (
            "402",
            ScheduleState::WaitingOn("150".to_owned()),
            "waiting on 150",
        ),
        ("403", ScheduleState::Ready, "ready"),
        (
            "404",
            ScheduleState::BlockedBy {
                id: "400".to_owned(),
                shared: vec!["src/r.ts".to_owned()],
            },
            "blocked by 400: src/r.ts",
        ),
        (
            "405",
            ScheduleState::BlockedBy {
                id: "403".to_owned(),
                shared: vec!["crates/core".to_owned()],
            },
            "blocked by 403: crates/core",
        ),
    ];
    assert_eq!(result.states.len(), expected.len());
    for (scheduled, (id, state, display)) in result.states.iter().zip(expected) {
        assert_state(scheduled, id, &state, display);
    }
    assert_eq!(result.start, ["403"]);
}

/// Proves shared units are distinct and in byte order.
///
/// Covers: rust-core/every-state-and-overlap-rule
#[test]
fn shared_units_are_distinct_and_sorted() {
    let queue = [queued(
        "501",
        true,
        &[],
        &["src/z.ts", "crates/core/a.rs", "src/a.ts"],
    )];
    let running = [running(
        "500",
        &[
            "src/z.ts",
            "crates/core/x.rs",
            "src/a.ts",
            "crates/core/y.rs",
        ],
    )];

    let result = schedule(&queue, &running);

    assert_state(
        &result.states[0],
        "501",
        &ScheduleState::BlockedBy {
            id: "500".to_owned(),
            shared: vec![
                "crates/core".to_owned(),
                "src/a.ts".to_owned(),
                "src/z.ts".to_owned(),
            ],
        },
        "blocked by 500: crates/core, src/a.ts, src/z.ts",
    );
    assert_eq!(result.start, Vec::<String>::new());
}
