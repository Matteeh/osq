//! Proves a usage-limit pause writes TypeScript's pause file and keeps the
//! attempt.

mod support;

#[allow(dead_code)]
#[path = "../src/feature/pause.rs"]
mod source_pause;

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use osq_core::event::{Event, UsageLimitData, parse_event_line};
use osq_kernel_runners::{PauseSource, UsagePause, pause_until};
use osq_kernel_storage::read_usage_pause;

use support::{FOLDER, TASK};

/// The error the fake pi reports.
const ERROR: &str = "429 Monthly usage limit reached";

/// TypeScript's default usage-limit wait.
const WAIT: Duration = Duration::from_secs(1800);

/// The fake pi's executable path, made absolute for `pi.bin`.
fn limit_pi() -> String {
    support::fixture("limit-pi")
        .join("run.sh")
        .to_string_lossy()
        .into_owned()
}

/// A fresh committed run fixture whose config names the limit-reporting pi.
fn repo(name: &str) -> PathBuf {
    let root = support::repo(name);
    let config = format!(
        "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"{}\"\n",
        limit_pi()
    );
    support::write(&root, "osq.toml", config);
    root
}

/// The current time as epoch milliseconds.
fn now_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
}

/// The task's event envelopes.
fn events(root: &Path) -> Vec<osq_core::event::Envelope> {
    support::read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/events/{TASK}.jsonl"),
    )
    .lines()
    .filter(|line| !line.trim().is_empty())
    .map(|line| parse_event_line(line).expect("the event parses"))
    .collect()
}

/// The pause's until bounds for the times just before and after a run.
fn until_bounds(before: i64, after: i64) -> (String, String) {
    let limit = UsageLimitData {
        resets_at: None,
        error: None,
    };
    (
        pause_until(&limit, before, WAIT).0,
        pause_until(&limit, after, WAIT).0,
    )
}

/// Proves each paused run writes the limit and pause events, the pause file,
/// and no dead, done or running marker.
///
/// Covers: rust-run/paused-on-a-usage-limit
#[test]
fn paused_on_a_usage_limit() {
    let root = repo("usage-pause");
    for run in 1..=2 {
        let before = now_ms();
        let result = support::run(&root, &[FOLDER, TASK]);
        let after = now_ms();
        assert_eq!(
            result.expect_err("the run pauses").to_string(),
            format!("run failed: task {TASK} of {FOLDER} paused on a usage limit"),
            "run {run}"
        );
        let events = events(&root);
        let started = events
            .iter()
            .rposition(|event| matches!(event.event, Event::Started(_)))
            .expect("the started event");
        let current = &events[started..];
        assert_eq!(current.len(), 3, "run {run}: started, usage_limit, paused");
        match &current[0].event {
            Event::Started(data) => {
                assert_eq!(data.harness.as_deref(), Some("pi"), "run {run}");
                assert_eq!(data.attempt, Some(1), "run {run}");
            }
            other => panic!("run {run}: expected started, got {other:?}"),
        }
        let (until_low, until_high) = until_bounds(before, after);
        let limit = match &current[1].event {
            Event::UsageLimit(data) => data,
            other => panic!("run {run}: expected usage_limit, got {other:?}"),
        };
        assert_eq!(limit.error.as_deref(), Some(ERROR), "run {run}");
        assert_eq!(limit.resets_at, None, "run {run}");
        let paused = match &current[2].event {
            Event::Paused(data) => data,
            other => panic!("run {run}: expected paused, got {other:?}"),
        };
        assert_eq!(paused.task, TASK, "run {run}");
        assert_eq!(paused.source, "wait", "run {run}");
        assert_eq!(paused.error.as_deref(), Some(ERROR), "run {run}");
        assert!(
            paused.until >= until_low && paused.until <= until_high,
            "run {run}: {} is not between {until_low} and {until_high}",
            paused.until
        );
        assert!(
            !events.iter().any(|event| matches!(
                event.event,
                Event::Exited(_) | Event::Retry(_) | Event::Recertification(_)
            )),
            "run {run}: no exited, retry or recertification event"
        );
        let content =
            support::read_text(&root, &format!("openspec/changes/{FOLDER}/.run/paused.md"));
        assert_eq!(
            content,
            format!(
                "---\ntask: \"{TASK}\"\nuntil: \"{}\"\nsource: \"wait\"\n---\n{ERROR}\n",
                paused.until
            ),
            "run {run}: the pause file"
        );
        let record =
            read_usage_pause(&support::change(&root)).expect("rust-storage reads the pause");
        assert_eq!(record.task, TASK, "run {run}");
        assert_eq!(record.until, paused.until, "run {run}");
        assert_eq!(record.source, "wait", "run {run}");
        assert_eq!(record.error.as_deref(), Some(ERROR), "run {run}");
        for path in [
            format!("openspec/changes/{FOLDER}/.run/dead/{TASK}.md"),
            format!("openspec/changes/{FOLDER}/.run/done/{TASK}"),
            format!("openspec/changes/{FOLDER}/.run/running/{TASK}.pid"),
        ] {
            assert!(!support::exists(&root, &path), "run {run}: {path} exists");
        }
    }
}

/// Proves the pause file's body falls back when the limit gave no error.
///
/// Covers: rust-run/paused-on-a-usage-limit
#[test]
fn pause_text_defaults_its_body() {
    let pause = UsagePause {
        task: "7".to_owned(),
        until: "2026-01-01T00:00:00.000Z".to_owned(),
        source: PauseSource::Wait,
        error: None,
    };
    assert_eq!(
        source_pause::content(&pause),
        "---\ntask: \"7\"\nuntil: \"2026-01-01T00:00:00.000Z\"\nsource: \"wait\"\n---\nusage limit reached\n"
    );
}

/// Proves the pause write creates `.run/` when it is missing.
///
/// Covers: rust-run/paused-on-a-usage-limit
#[test]
fn pause_write_creates_the_run_folder() {
    let root = support::scratch("pause-no-run");
    let folder = root.join("openspec").join("changes").join(FOLDER);
    let pause = UsagePause {
        task: TASK.to_owned(),
        until: "2026-01-01T00:00:00.000Z".to_owned(),
        source: PauseSource::Harness,
        error: Some("quota exceeded".to_owned()),
    };
    source_pause::write(&folder, &pause).expect("the pause is written");
    assert_eq!(
        support::read_text(&root, &format!("openspec/changes/{FOLDER}/.run/paused.md")),
        "---\ntask: \"1\"\nuntil: \"2026-01-01T00:00:00.000Z\"\nsource: \"harness\"\n---\nquota exceeded\n"
    );
}
