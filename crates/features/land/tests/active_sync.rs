//! Proves an active change syncs, verifies its done tasks and recertifies them.

mod support;

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::FeatureError;
use osq_kernel_storage::{task_scope_hash, watch_state_dir};
use serde_json::{Value, json};
use support::{ChangeTree, FIXTURE_FOLDER, LandRepo, fixture, orders_spec, run_args, scratch};

/// The sync goldens' path.
const SYNC_GOLDEN: &str = "sync-message-golden/sync.json";
/// The marker that says the test runs in its own home.
const HOME_MARKER: &str = "OSQ_ACTIVE_SYNC_HOME";
/// The active change's folder.
fn change_folder() -> String {
    format!("openspec/changes/{FIXTURE_FOLDER}")
}
/// One path inside the active change's folder.
fn active(relative: &str) -> String {
    format!("{}/{relative}", change_folder())
}

/// The golden rows parsed from TypeScript's `sync.json`.
fn rows() -> Vec<Value> {
    let text = fs::read_to_string(fixture(SYNC_GOLDEN)).expect("the sync goldens read");
    serde_json::from_str(&text).expect("the sync goldens are JSON")
}

/// One task file with the row's verify and scope.
fn task_file(n: u32, verify: &str, scope: &str) -> String {
    format!(
        "---\ntitle: Task {n}\nverify: {verify}\nscope:\n  - {scope}\n---\n## Acceptance\n\n- [ ] Task {n} works.\n"
    )
}

/// The active change's files, with `verifies` replacing task verifies.
fn active_files(verifies: &[(u32, &str)]) -> Vec<(String, String)> {
    let mut files = vec![
        (
            active("proposal.md"),
            "---\ntitle: A\nverify: echo change\n---\n## Verify\n\nx\n".to_owned(),
        ),
        (active(".run/approved"), "sha256:aaaa\n".to_owned()),
        (
            active(".run/done/2"),
            "---\nmanual: true\n---\n2026-10-20T08:00:00.000Z\n".to_owned(),
        ),
        (
            active(".run/done/3"),
            "---\nverified_by: watcher\n---\n2026-10-20T08:00:00.000Z\n".to_owned(),
        ),
    ];
    for (n, scope) in [
        (1, "src/**"),
        (2, "src/one.txt"),
        (3, "src/one.txt"),
        (4, "src/one.txt"),
    ] {
        let verify = custom(verifies, n).unwrap_or(default_verify(n));
        files.push((
            active(&format!("tasks/{n}.md")),
            task_file(n, verify, scope),
        ));
    }
    files
}

/// The verify the golden script gives one task.
fn default_verify(n: u32) -> &'static str {
    match n {
        1 => "echo one",
        2 => "echo two",
        3 => "echo three",
        _ => "echo four",
    }
}

/// A task's replaced verify, or none.
fn custom<'a>(verifies: &'a [(u32, &'a str)], n: u32) -> Option<&'a str> {
    verifies
        .iter()
        .find(|(id, _)| *id == n)
        .map(|(_, verify)| *verify)
}

/// Writes task 1's done marker with the scope hash of the tree as it is.
fn mark_task_one_done(repo: &LandRepo, change: &ChangeTree) {
    let hash = task_scope_hash(&change.path, &["src/**".to_owned()]);
    let files = hash.files.iter().fold(String::new(), |mut text, file| {
        let _ = writeln!(
            text,
            "  {}: {}",
            file.path,
            file.hash.as_deref().unwrap_or("null")
        );
        text
    });
    repo.write(
        &change.path,
        &active(".run/done/1"),
        format!(
            "---\nscope_hash: {}\nscope_files:\n{files}scope_resolver: 2\n---\n2026-10-20T08:00:00.000Z\n",
            hash.hash
        ),
    );
}

/// Builds the repository one active golden row names.
fn build(repo: &LandRepo, name: &str) -> ChangeTree {
    let change = repo.add_worktree(FIXTURE_FOLDER);
    repo.write(&change.path, "src/one.txt", "two\n");
    if name == "active-unapproved-001" {
        repo.write(&change.path, &active("proposal.md"), "---\ntitle: A\n---\n");
        repo.commit_all(&change.path, &format!("work on {FIXTURE_FOLDER}"));
        repo.main_file("other.txt", "other\n", "main adds other");
        return change;
    }
    let verifies: &[(u32, &str)] = if name == "active-red-001" {
        &[(3, "echo broken; exit 1")]
    } else {
        &[]
    };
    for (path, text) in active_files(verifies) {
        repo.write(&change.path, &path, text);
    }
    if name == "active-spec-001" {
        repo.write(
            &change.path,
            &active("specs/orders/spec.md"),
            support::ALPHA_DELTA,
        );
    }
    mark_task_one_done(repo, &change);
    repo.commit_all(&change.path, &format!("work on {FIXTURE_FOLDER}"));
    setup(repo, &change, name);
    change
}

/// Applies the row's `main` commit and untracked or watcher files.
fn setup(repo: &LandRepo, change: &ChangeTree, name: &str) {
    match name {
        "active-recert-001" | "active-red-001" => {
            repo.main_file("src/three.txt", "three\n", "main adds three");
        }
        "active-current-001" => {}
        "active-code-conflict-001" => {
            repo.main_file("src/one.txt", "main\n", "main edits one");
        }
        "active-spec-001" => {
            repo.main_file(
                "openspec/specs/orders/spec.md",
                orders_spec("Beta"),
                "main adds beta",
            );
        }
        "active-running-001" => {
            repo.write(
                &change.path,
                &active(".run/running/4.pid"),
                "{\"pid\":1,\"startedAt\":1}\n",
            );
            repo.main_file("other.txt", "other\n", "main adds other");
        }
        "active-dirty-001" => {
            repo.write(&change.path, &active("tasks.md"), "# Tasks\n");
            repo.write(&change.path, &active(".run/extra"), "extra\n");
            repo.write(&change.path, "notes.txt", "dirty\n");
            repo.main_file("other.txt", "other\n", "main adds other");
        }
        "active-prepare-001" => {
            repo.write(
                repo.checkout(),
                "osq.toml",
                format!(
                    "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\nprepare = {}\n",
                    json!("echo nope; exit 1")
                ),
            );
            repo.main_file("other.txt", "other\n", "main adds other");
        }
        _ => repo.main_file("other.txt", "other\n", "main adds other"),
    }
}

/// Writes a live watcher record for the checkout under `home`.
fn write_watcher(root: &Path, home: &Path) {
    let state = watch_state_dir(root, home);
    fs::create_dir_all(&state).expect("the watch state folder is created");
    fs::write(
        state.join("watcher.json"),
        format!(
            "{{\"pid\":{},\"mode\":\"terminal\",\"version\":\"0.3.0\",\"commit\":\"abc1234\",\"startedAt\":\"2026-10-24T08:00:00.000Z\",\"waiting\":null}}\n",
            std::process::id()
        ),
    )
    .expect("the watcher record writes");
}

/// Reads a file under the worktree, or empty text when it is absent.
fn read_or_empty(change: &ChangeTree, relative: &str) -> String {
    fs::read_to_string(change.path.join(relative)).unwrap_or_default()
}

/// The JSON lines `after` adds to `before`, with run values replaced.
fn added_events(before: &str, after: &str, change: &ChangeTree) -> Value {
    let lines: Vec<Value> = after[before.len()..]
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let line = line.replace(&change.path.display().to_string(), "<wt>");
            let mut event: Value = serde_json::from_str(&line).expect("the event line is JSON");
            event["timestamp"] = json!("<ts>");
            if event["data"]["duration"].is_number() {
                event["data"]["duration"] = json!("<ms>");
            }
            event
        })
        .collect();
    Value::Array(lines)
}

/// Replaces a `recertified_at` value with the golden placeholder.
fn placeholder_timestamp(text: &str) -> String {
    text.split_inclusive('\n')
        .map(|line| {
            if line.starts_with("recertified_at: ") {
                "recertified_at: <ts>\n"
            } else {
                line
            }
        })
        .collect()
}

/// Replaces the goldens' path placeholders.
fn placeholders(text: &str, change: &ChangeTree) -> String {
    text.replace("<wt>", &change.path.display().to_string())
        .replace("<pid>", &std::process::id().to_string())
}

/// Checks one active golden row's output, repository and streams.
fn check_row(row: &Value, home: Option<&Path>) {
    let name = row["name"].as_str().expect("a row has a name");
    let query = row["query"].as_str().expect("a row has a query");
    let repo = LandRepo::new(&format!("active-sync-{name}"));
    let change = build(&repo, name);
    if name.contains("watcher") {
        write_watcher(
            repo.checkout(),
            home.expect("a watcher row has its own home"),
        );
    }
    let change_events = active(".run/events/change.jsonl");
    let task_events = active(".run/events/1.jsonl");
    let before_change = read_or_empty(&change, &change_events);
    let before_task = read_or_empty(&change, &task_events);
    let result = run_args(repo.checkout(), "sync", &[query]);
    let expected = |key: &str| {
        placeholders(
            row[key].as_str().unwrap_or_else(|| panic!("{name}: {key}")),
            &change,
        )
    };
    if row["exit"].as_u64() == Some(0) {
        let output = result
            .unwrap_or_else(|error| panic!("{name}: {error}"))
            .text;
        assert_eq!(output, expected("stdout"), "{name}: stdout");
    } else {
        let error = result.expect_err(name);
        match &error {
            FeatureError::Failed {
                command, message, ..
            } => {
                assert_eq!(command, "sync", "{name}: command");
                assert_eq!(message, &expected("error"), "{name}: error");
            }
            other => panic!("{name}: expected a failed error, got {other:?}"),
        }
    }
    let tip = repo.git(
        repo.checkout(),
        &["log", "-1", "--format=%B", &format!("osq/{FIXTURE_FOLDER}")],
    );
    assert_eq!(tip, expected("tip"), "{name}: tip");
    let status = repo.git(
        &change.path,
        &["status", "--porcelain", "--untracked-files=all"],
    );
    assert_eq!(status, expected("status"), "{name}: status");
    let regressed = repo.exists(
        &change.path,
        &format!("openspec/changes/archive/{FIXTURE_FOLDER}/.run/regressed/change.md"),
    );
    assert_eq!(
        regressed,
        row["regressed"].as_bool().expect("a row says regressed"),
        "{name}: regressed"
    );
    if let Some(spec) = row.get("spec").and_then(Value::as_str) {
        let merged = repo.read(&change.path, "openspec/specs/orders/spec.md");
        assert_eq!(merged, spec, "{name}: spec");
    }
    if let Some(expected) = row.get("changeEvents") {
        let actual = added_events(
            &before_change,
            &read_or_empty(&change, &change_events),
            &change,
        );
        assert_eq!(&actual, expected, "{name}: change events");
    }
    if let Some(expected) = row.get("taskEvents") {
        let actual = added_events(&before_task, &read_or_empty(&change, &task_events), &change);
        assert_eq!(&actual, expected, "{name}: task events");
    }
    if let Some(expected) = row.get("done").and_then(Value::as_str) {
        let actual = placeholder_timestamp(&read_or_empty(&change, &active(".run/done/1")));
        assert_eq!(actual, expected, "{name}: done marker");
    }
}

/// Builds a change with only the given done tasks, each with a verify.
fn build_tasks(repo: &LandRepo, tasks: &[(u32, &str)]) -> ChangeTree {
    let change = repo.add_worktree(FIXTURE_FOLDER);
    repo.write(&change.path, "src/one.txt", "two\n");
    repo.write(&change.path, &active("proposal.md"), "---\ntitle: A\n---\n");
    repo.write(&change.path, &active(".run/approved"), "sha256:aaaa\n");
    for (n, verify) in tasks {
        repo.write(
            &change.path,
            &active(&format!("tasks/{n}.md")),
            task_file(*n, verify, "src/one.txt"),
        );
        repo.write(
            &change.path,
            &active(&format!(".run/done/{n}")),
            "---\nverified_by: watcher\n---\n2026-10-20T08:00:00.000Z\n",
        );
    }
    repo.commit_all(&change.path, &format!("work on {FIXTURE_FOLDER}"));
    repo.main_file("other.txt", "other\n", "main adds other");
    change
}

/// Proves active sync runs task verifies in numeric rather than byte order.
///
/// Covers: rust-land/active-sync-verifies-done-tasks
#[test]
fn active_sync_orders_tasks_numerically() {
    let repo = LandRepo::new("active-sync-task-order");
    let change = build_tasks(&repo, &[(2, "echo two"), (10, "echo ten")]);
    run_args(repo.checkout(), "sync", &["1"]).expect("the sync succeeds");
    let events = branch_events(&repo, &change);
    let tasks: Vec<&str> = events
        .iter()
        .filter(|event| event["type"] == "verify_ran")
        .filter_map(|event| event["data"]["task"].as_str())
        .collect();
    assert_eq!(tasks, ["2", "10"]);
}

/// Proves a stop after recertifying writes both files back as they were.
///
/// Covers: rust-land/sync-recertifies-a-done-task
#[test]
fn active_sync_restores_recertified_files_on_a_stop() {
    let repo = LandRepo::new("active-sync-recertify-stop");
    let change = build(&repo, "active-recert-001");
    let before = repo.read(&change.path, &active(".run/done/1"));
    repo.write(&change.path, &active(".run/.gitignore"), "events/1.jsonl\n");
    let error = run_args(repo.checkout(), "sync", &["1"]).expect_err("the sync stops");
    assert!(
        error.to_string().starts_with("sync failed: git "),
        "{error}"
    );
    assert_eq!(repo.read(&change.path, &active(".run/done/1")), before);
    assert!(!repo.exists(&change.path, &active(".run/events/1.jsonl")));
    let events = repo.read(&change.path, &active(".run/events/change.jsonl"));
    assert!(events.contains("\"type\":\"sync_stopped\""), "{events}");
}

/// Proves every row of "Active sync equals TypeScript's".
///
/// Covers: rust-land/active-sync-equals-typescript-s
#[test]
fn active_sync_equals_typescript() {
    if let Some(home) = std::env::var_os(HOME_MARKER).map(PathBuf::from) {
        for row in rows().iter().filter(|row| {
            row["name"]
                .as_str()
                .is_some_and(|name| name == "active-watcher-001")
        }) {
            check_row(row, Some(&home));
        }
        return;
    }
    for row in rows() {
        let name = row["name"].as_str().expect("a row has a name");
        if !name.starts_with("active-") || name.contains("watcher") {
            continue;
        }
        check_row(&row, None);
    }
    spawn_home_child();
}

/// Runs the active watcher row in a child whose HOME is a fresh scratch folder.
fn spawn_home_child() {
    let home = scratch("active-sync-watcher-home");
    let status = Command::new(std::env::current_exe().expect("the test binary is known"))
        .args(["--exact", "active_sync_equals_typescript", "--nocapture"])
        .env(HOME_MARKER, &home)
        .env("HOME", &home)
        .status()
        .expect("the child starts");
    assert!(status.success(), "the isolated-home child fails");
}

/// The events the active change's branch tip holds.
fn branch_events(repo: &LandRepo, change: &ChangeTree) -> Vec<Value> {
    let branch = format!("osq/{FIXTURE_FOLDER}");
    let path = active(".run/events/change.jsonl");
    let text = repo.git(&change.path, &["show", &format!("{branch}:{path}")]);
    text.lines()
        .map(|line| serde_json::from_str(line).expect("the branch's event line is JSON"))
        .collect()
}

/// Proves the comments clean row verifies tasks 1 and 3 and records each run.
///
/// Covers: rust-land/active-sync-verifies-done-tasks
#[test]
fn active_sync_verifies_done_tasks() {
    let repo = LandRepo::new("active-sync-verify-tasks");
    let change = build(&repo, "active-clean-001");
    let output = run_args(repo.checkout(), "sync", &["001"])
        .expect("the sync succeeds")
        .text;
    assert_eq!(output, "Synced osq/001-alpha-orders with main\n");

    let events = branch_events(&repo, &change);
    let tail = &events[events.len() - 3..];
    assert_eq!(tail[0]["type"], "verify_ran");
    assert_eq!(tail[0]["data"]["command"], "echo one");
    assert_eq!(tail[0]["data"]["exitCode"], 0);
    assert!(tail[0]["data"]["duration"].is_u64());
    assert_eq!(tail[0]["data"]["log"], ".run/logs/change-1.log");
    assert_eq!(tail[0]["data"]["output"], "one\n");
    assert_eq!(tail[0]["data"]["task"], "1");
    assert_eq!(tail[1]["type"], "verify_ran");
    assert_eq!(tail[1]["data"]["command"], "echo three");
    assert_eq!(tail[1]["data"]["exitCode"], 0);
    assert!(tail[1]["data"]["duration"].is_u64());
    assert_eq!(tail[1]["data"]["log"], ".run/logs/change-2.log");
    assert_eq!(tail[1]["data"]["output"], "three\n");
    assert_eq!(tail[1]["data"]["task"], "3");
    assert_eq!(tail[2]["type"], "synced");
    assert_eq!(tail[2]["data"]["defaultBranch"], "main");
    assert_eq!(tail[2]["data"]["commits"], 1);
    assert!(
        !events
            .iter()
            .any(|event| matches!(event["data"]["task"].as_str(), Some("2" | "4"))),
        "{events:?}"
    );
}

/// Proves the recertification row rewrites task 1's done marker and event.
///
/// Covers: rust-land/sync-recertifies-a-done-task
#[test]
fn sync_recertifies_a_done_task() {
    let repo = LandRepo::new("active-sync-recertify");
    let change = build(&repo, "active-recert-001");
    let output = run_args(repo.checkout(), "sync", &["1"])
        .expect("the sync succeeds")
        .text;
    assert_eq!(output, "Synced osq/001-alpha-orders with main\n");
    let branch = format!("osq/{FIXTURE_FOLDER}");
    let tip = repo.git(repo.checkout(), &["log", "-1", "--format=%B", &branch]);
    assert_eq!(
        tip,
        "osq: 001 sync main\n\nOsq-Change: 001-alpha-orders\n\n"
    );
    let status = repo.git(
        &change.path,
        &["status", "--porcelain", "--untracked-files=all"],
    );
    assert_eq!(status, "");

    let done_path = active(".run/done/1");
    let done = repo.git(&change.path, &["show", &format!("{branch}:{done_path}")]);
    for line in [
        "scope_hash: sha256:abd06aad734c595d9ca453314c581dd6103e868facbf06b6a39300d0cb11999a",
        "  src/three.txt: sha256:f6936912184481f5edd4c304ce27c5a1a827804fc7f329f43d273b8621870776",
        "original_scope_hash: sha256:bcf9ceadb6fd71887cd9924852f82d36b559475e12a0bfcc6992681ed4fbe75d",
        "recertification_count: 1",
    ] {
        assert!(done.contains(line), "{line}\n{done}");
    }

    let events_path = active(".run/events/1.jsonl");
    let events = repo.git(&change.path, &["show", &format!("{branch}:{events_path}")]);
    let event: Value = serde_json::from_str(
        events
            .lines()
            .last()
            .expect("the task stream ends with an event"),
    )
    .expect("the recertification line is JSON");
    assert_eq!(event["type"], "recertification");
    assert_eq!(
        event["data"],
        json!({
            "task": "1",
            "outcome": "passed",
            "differingPaths": ["src/three.txt (added)"],
            "attribution": [{"path": "src/three.txt (added)", "attribution": "sync"}],
            "command": "echo one",
            "exitCode": 0,
            "timedOut": false,
            "recordedHash": "sha256:bcf9ceadb6fd71887cd9924852f82d36b559475e12a0bfcc6992681ed4fbe75d",
            "currentHash": "sha256:abd06aad734c595d9ca453314c581dd6103e868facbf06b6a39300d0cb11999a",
            "automatic": true
        })
    );
}
