//! Proves `status` refuses an argument and prints each TypeScript golden.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;
use osq_kernel_storage::watch_state_dir;

/// The marker that says the test runs in its own home.
const HOME_MARKER: &str = "OSQ_STATUS_HOME";
/// The test name whose scratch folders every row lives under.
const TEST: &str = "status_text_equals_typescript";
/// A pid no process holds.
const DEAD_PID: &str = "2147483646";
/// The approved change the git row puts on its worktree branch.
const APPROVED: &str = "openspec/changes/002-approved";
/// The archived change the git row keeps on a second branch.
const ARCHIVED: &str = "openspec/changes/archive/010-archived";
/// The author and committer name every setup commit gets.
const NAME: &str = "osq";
/// The author and committer email every setup commit gets.
const EMAIL: &str = "osq@example.com";

/// One golden row: its case name and file.
struct Row {
    /// The case name the golden script gives it.
    name: &'static str,
    /// The golden file in the crate's fixtures.
    golden: &'static str,
}

/// The eight rows of "Status text equals TypeScript's".
fn rows() -> [Row; 8] {
    [
        Row {
            name: "status-project",
            golden: "status-project.txt",
        },
        Row {
            name: "status-empty",
            golden: "status-empty.txt",
        },
        Row {
            name: "status-watch-terminal",
            golden: "status-watch-terminal.txt",
        },
        Row {
            name: "status-watch-background",
            golden: "status-watch-background.txt",
        },
        Row {
            name: "status-watch-restarting",
            golden: "status-watch-restarting.txt",
        },
        Row {
            name: "status-watch-dead",
            golden: "status-watch-dead.txt",
        },
        Row {
            name: "status-pending",
            golden: "status-pending.txt",
        },
        Row {
            name: "status-git",
            golden: "status-git.txt",
        },
    ]
}

/// Proves `status` refuses an argument before reading any file.
///
/// Covers: rust-show/status-argument-error
#[test]
fn status_argument_error() {
    let root = scratch("status_argument_error", "root");
    let error = ShowFeature
        .run(&Invocation::new(&root, "status", vec!["1".to_owned()]))
        .expect_err("the argument is refused");
    assert_eq!(error.to_string(), "usage of status: takes no arguments");
    assert!(matches!(error, FeatureError::Usage { .. }));
}

/// Proves each of the eight golden rows byte for byte.
///
/// Covers: rust-show/status-text-equals-typescript-s
#[test]
fn status_text_equals_typescript() {
    let Some(home) = std::env::var_os(HOME_MARKER).map(PathBuf::from) else {
        spawn_home_child();
        return;
    };
    for row in rows() {
        check_row(&row, &home);
    }
}

/// Builds one row under its own scratch root and compares its output.
fn check_row(row: &Row, home: &Path) {
    let root = scratch(TEST, row.name);
    let state = watch_state_dir(&root, home);
    setup(row.name, &root, &state);
    let output = run(&root).expect("status runs");
    let golden = fs::read_to_string(golden(row.golden)).expect("the golden reads");
    let expected = expected(&golden, &root, &state);
    assert_eq!(output, expected, "{}", row.name);
    extra_checks(row.name, &root, &state);
}

/// Checks the edges a golden row cannot show without changing its files.
fn extra_checks(name: &str, root: &Path, state: &Path) {
    match name {
        "status-watch-terminal" => {
            write(
                &state.join("watcher.json"),
                &watcher(std::process::id(), "terminal", "\"\""),
            );
            let output = run(root).expect("status runs");
            assert!(
                !output.contains(", waiting:"),
                "empty waiting is not printed"
            );
        }
        "status-git" => git_edges(root),
        _ => {}
    }
}

/// Checks a worktree without a running task, one commit and a landed archive.
fn git_edges(root: &Path) {
    let wt = PathBuf::from(format!("{}-wt", root.display()));
    let _ = fs::remove_file(wt.join(APPROVED).join(".run/running/2.pid"));
    append(
        &wt.join(APPROVED).join(".run/events/change.jsonl"),
        "{\"type\":\"synced\",\"timestamp\":\"2026-10-24T10:00:00.000Z\",\"data\":{\"defaultBranch\":\"main\",\"commits\":1}}\n",
    );
    let output = run(root).expect("status runs");
    assert!(!output.contains("warning: a task is running"), "no warning");
    assert!(
        !output.contains("sync stopped:"),
        "a later sync clears the stop"
    );
    assert!(
        output
            .lines()
            .any(|line| line == "  last sync: 2026-10-24T10:00:00.000Z, 1 commit from main"),
        "one commit is singular"
    );
    git(
        root,
        root,
        &["merge", "-q", "--ff-only", "osq/010-archived"],
    );
    let output = run(root).expect("status runs");
    assert!(
        !output.contains("Not landed:"),
        "a landed archive is not listed"
    );
}

/// Replaces the golden script's placeholders with this row's values.
fn expected(golden: &str, root: &Path, state: &Path) -> String {
    golden
        .replace("<state>", &state.display().to_string())
        .replace("<root>", &root.display().to_string())
        .replace("<pid>", &std::process::id().to_string())
}

/// Builds the files one row's golden script case writes.
fn setup(name: &str, root: &Path, state: &Path) {
    match name {
        "status-project" => project(root),
        "status-empty" => {}
        "status-watch-terminal" => {
            project(root);
            write(
                &state.join("watcher.json"),
                &watcher(std::process::id(), "terminal", "null"),
            );
        }
        "status-watch-background" => {
            project(root);
            write(&state.join("service.json"), &service(state));
            write(
                &state.join("watcher.json"),
                &watcher(
                    std::process::id(),
                    "background",
                    r#""usage limit until 2026-10-24T10:00:00.000Z""#,
                ),
            );
            write(&state.join("watch.log"), "started\n");
        }
        "status-watch-restarting" => {
            project(root);
            write(&state.join("service.json"), &service(state));
        }
        "status-watch-dead" => {
            project(root);
            write(
                &state.join("watcher.json"),
                &watcher(
                    DEAD_PID.parse().expect("the dead pid reads"),
                    "terminal",
                    "null",
                ),
            );
        }
        "status-pending" => pending(root, state),
        "status-git" => git_row(root),
        other => panic!("unknown status row {other}"),
    }
}

/// Copies the fixture and writes the running marker every case but empty has.
fn project(root: &Path) {
    copy_dir(&fixture(), root);
    write(
        &root.join("openspec/changes/003-running/.run/running/1.pid"),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
}

/// Writes the pending golden's after-land, validator and autopilot records.
fn pending(root: &Path, state: &Path) {
    project(root);
    write(
        &state.join("after-land.json"),
        "{\"change\":\"010-archived\",\"command\":\"pnpm build\",\"exitCode\":1,\"failedAt\":\"2026-10-24T09:00:00.000Z\"}\n",
    );
    append(
        &root.join(ARCHIVED).join(".run/events/change.jsonl"),
        "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-24T09:30:00.000Z\",\"data\":{\"outcome\":\"failed\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1,\"exitCode\":null,\"scenarios\":1,\"findings\":[],\"restored\":[],\"output\":\"boom\"}}\n",
    );
    write(
        &root.join("openspec/.run/autopilot-stop.md"),
        "---\nreason: land_stopped\nitem: alpha-item\nchange: \"010\"\ncommand: osq land 010\nat: 2026-10-24T09:45:00.000Z\n---\nland failed\n",
    );
}

/// Builds the git row's checkout, two worktrees and their sync events.
fn git_row(root: &Path) {
    project(root);
    write(
        &root.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
    );
    let keep = PathBuf::from(format!("{}-keep", root.display()));
    let _ = fs::remove_dir_all(&keep);
    fs::create_dir_all(&keep).expect("the keep folder is created");
    fs::rename(root.join(APPROVED), keep.join("approved")).expect("the approved folder moves");
    fs::rename(root.join(ARCHIVED), keep.join("archived")).expect("the archived folder moves");
    git(root, root, &["init", "-q", "-b", "main"]);
    git(root, root, &["config", "commit.gpgSign", "false"]);
    commit(root, root, "all");
    let wt = PathBuf::from(format!("{}-wt", root.display()));
    let _ = fs::remove_dir_all(&wt);
    git(
        root,
        root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/002-approved",
            wt.to_str().expect("the worktree path is text"),
        ],
    );
    copy_dir(&keep.join("approved"), &wt.join(APPROVED));
    append(
        &wt.join(APPROVED).join(".run/events/change.jsonl"),
        concat!(
            "{\"type\":\"synced\",\"timestamp\":\"2026-10-24T08:00:00.000Z\",\"data\":{\"defaultBranch\":\"main\",\"commits\":2}}\n",
            "{\"type\":\"sync_stopped\",\"timestamp\":\"2026-10-24T09:00:00.000Z\",\"data\":{\"reason\":\"conflict\",\"message\":\"src/alpha.ts conflicts\\nsecond line\"}}\n",
        ),
    );
    commit(root, &wt, "approve 002");
    write(
        &wt.join(APPROVED).join(".run/running/2.pid"),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
    let wt2 = PathBuf::from(format!("{}-wt2", root.display()));
    let _ = fs::remove_dir_all(&wt2);
    git(
        root,
        root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/010-archived",
            wt2.to_str().expect("the worktree path is text"),
        ],
    );
    copy_dir(&keep.join("archived"), &wt2.join(ARCHIVED));
    commit(root, &wt2, "archive 010");
}

/// Runs git in `dir` with isolated settings and the fixed identity.
fn git(ceiling: &Path, dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", ceiling)
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "maintenance.auto")
        .env("GIT_CONFIG_VALUE_0", "false")
        .env("GIT_AUTHOR_NAME", NAME)
        .env("GIT_AUTHOR_EMAIL", EMAIL)
        .env("GIT_COMMITTER_NAME", NAME)
        .env("GIT_COMMITTER_EMAIL", EMAIL)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed in {}: {}",
        args.join(" "),
        dir.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Stages everything in `dir` and commits it.
fn commit(ceiling: &Path, dir: &Path, message: &str) {
    git(ceiling, dir, &["add", "-A"]);
    git(ceiling, dir, &["commit", "-q", "-m", message]);
}

/// A service record naming this test process.
fn service(state: &Path) -> String {
    format!(
        "{{\"pid\":{},\"startedAt\":\"2026-10-24T08:00:00.000Z\",\"log\":\"{}\"}}\n",
        std::process::id(),
        state.join("watch.log").display()
    )
}

/// A watcher record with the row's pid, mode and waiting JSON value.
fn watcher(pid: u32, mode: &str, waiting: &str) -> String {
    format!(
        "{{\"pid\":{pid},\"mode\":\"{mode}\",\"version\":\"0.3.0\",\"commit\":\"abc1234\",\"startedAt\":\"2026-10-24T08:00:00.000Z\",\"waiting\":{waiting}}}\n"
    )
}

/// Runs this test in a child whose HOME is a fresh scratch folder.
fn spawn_home_child() {
    let home = scratch(TEST, "home");
    let status = Command::new(std::env::current_exe().expect("the test binary is known"))
        .args(["--exact", TEST, "--nocapture"])
        .env(HOME_MARKER, &home)
        .env("HOME", &home)
        .status()
        .expect("the child starts");
    assert!(status.success(), "the isolated-home child fails");
}

/// Runs status on one root.
fn run(root: &Path) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(root, "status", Vec::new()))
        .map(|output| output.text)
}

/// A fresh scratch folder under one test and row name.
fn scratch(test: &str, row: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(test).join(row);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    fs::canonicalize(root).expect("the scratch folder resolves")
}

/// The path of one golden file in the crate's fixtures.
fn golden(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/golden")
        .join(name)
}

/// The fixture project every non-empty row copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Appends text to a file, creating its parent folders.
fn append(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .expect("the file opens");
    file.write_all(text.as_bytes())
        .expect("the text is written");
}
