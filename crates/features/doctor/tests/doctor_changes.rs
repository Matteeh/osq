//! Proves doctor's locks, archives and done-marker change lines.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The lock text of a pid no process holds.
const DEAD: &str = r#"{"pid":2147483647,"startedAt":1}"#;

/// The lock text holding the test process's live pid.
const LIVE: &str = r#"{"pid":<live>,"startedAt":1}"#;

/// What one row expects doctor to return.
enum Expected {
    /// Success with exactly this text.
    Output(&'static str),
    /// Failure with exactly this message.
    Failed(&'static str),
}

/// One row of "Doctor change lines".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// Files written under `openspec/changes/`, exactly as given.
    files: &'static [(&'static str, &'static str)],
    /// What doctor returns for the row.
    expected: Expected,
}

/// The rows of "Doctor change lines", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "empty",
        files: &[],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: agy)\n",
            "[ok] managed-blocks: managed blocks valid\n",
            "[ok] locks: no orphaned locks\n",
            "[ok] archives: all archives valid\n",
            "[ok] done-markers: all done markers verified\n",
            "<git>\n",
        )),
    },
    Row {
        name: "live-lock",
        files: &[("001-a/.run/running/1.pid", LIVE)],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: agy)\n",
            "[ok] managed-blocks: managed blocks valid\n",
            "[ok] locks: no orphaned locks\n",
            "[ok] archives: all archives valid\n",
            "[ok] done-markers: all done markers verified\n",
            "<git>\n",
        )),
    },
    Row {
        name: "orphaned-locks",
        files: &[
            ("001-a/.run/running/1.pid", DEAD),
            ("001-a/.run/locks/2.pid", "not json"),
            ("001-a/.run/running/notes.txt", DEAD),
            ("002-b/.run/running/1.pid", r#"{"pid":0}"#),
            ("archive/003-c/proposal.md", "x"),
            ("archive/003-c/tasks.md", "x"),
            ("archive/003-c/.run/running/1.pid", DEAD),
            ("rejected/004-d/.run/running/1.pid", DEAD),
        ],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: agy)\n",
            "[ok] managed-blocks: managed blocks valid\n",
            "[fail] locks: orphaned lock(s): ",
            "openspec/changes/001-a/.run/running/1.pid, ",
            "openspec/changes/001-a/.run/locks/2.pid, ",
            "openspec/changes/002-b/.run/running/1.pid\n",
            "[ok] archives: all archives valid\n",
            "[ok] done-markers: all done markers verified\n",
            "<git>",
        )),
    },
    Row {
        name: "invalid-archives",
        files: &[
            ("archive/002-b/proposal.md", "x"),
            ("archive/003-c/spec.md", "x"),
            ("archive/003-c/tasks/1.md", "x"),
            ("archive/004-d/tasks.md", "x"),
            ("rejected/005-e/x.md", "x"),
        ],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: agy)\n",
            "[ok] managed-blocks: managed blocks valid\n",
            "[ok] locks: no orphaned locks\n",
            "[fail] archives: invalid archive(s): ",
            "openspec/changes/archive/002-b, openspec/changes/archive/004-d\n",
            "[ok] done-markers: all done markers verified\n",
            "<git>",
        )),
    },
    Row {
        name: "unverified-done-markers",
        files: &[
            ("001-a/.run/done/1.md", "---\nscope_hash: abc\n---\n"),
            ("001-a/.run/done/2.md", "done\n"),
            (
                "001-a/.run/done/3.md",
                "---\nmanual: true\nreason: checked by hand\n---\n",
            ),
            ("archive/002-b/proposal.md", "x"),
            ("archive/002-b/tasks.md", "x"),
            ("archive/002-b/.run/done/1.md", "done\n"),
        ],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: agy)\n",
            "[ok] managed-blocks: managed blocks valid\n",
            "[ok] locks: no orphaned locks\n",
            "[ok] archives: all archives valid\n",
            "[fail] done-markers: unverified done marker placed by hand: ",
            "openspec/changes/001-a/.run/done/2.md\n",
            "<git>",
        )),
    },
];

/// A fresh scratch folder named after the test, with its old contents removed.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// The managed files doctor checks, paired with their test fixture copies.
const MANAGED_FILES: [(&str, &str); 3] = [
    ("AGENTS.md", "agents-block.txt"),
    ("PLANNER.md", "planner-block.txt"),
    (".claude/commands/osq-plan.md", "claude-plan-command.txt"),
];

/// Writes the managed files every doctor root holds, each with a trailing
/// newline after the test copy.
fn managed_files(root: &Path) {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/managed");
    for (path, fixture) in MANAGED_FILES {
        let text = fs::read_to_string(fixtures.join(fixture)).expect("the managed fixture reads");
        write(&root.join(path), &format!("{text}\n"));
    }
}

/// Makes a scratch root a git repository.
fn git_init(root: &Path) {
    git(root, &["init", "-q"]);
}

/// The `git` line for a repository doctor accepts.
fn git_line() -> String {
    let output = Command::new("git")
        .arg("--version")
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git --version: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let version = String::from_utf8_lossy(&output.stdout);
    let first = version.lines().next().unwrap_or("").trim();
    format!("[ok] git: {first}")
}

/// Runs git in a folder, failing with both streams when it refuses.
fn git(repo: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {args:?}: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Commits every change in a worktree or the checkout.
fn commit(repo: &Path, message: &str) {
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-m", message]);
}

/// Builds a scratch repository with one main commit and the vcs `osq.toml`.
fn repository(base: &Path, worktrees: &Path) -> PathBuf {
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    write(
        &repo.join("osq.toml"),
        &format!(
            "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\nworktreeRoot = \"{}\"\n",
            worktrees.display()
        ),
    );
    managed_files(&repo);
    commit(&repo, "main commit");
    repo
}

/// Runs the doctor command on a root and returns its result text.
fn doctor(root: &Path) -> Result<String, FeatureError> {
    DoctorFeature
        .run(&Invocation::new(root, "doctor", Vec::new()))
        .map(|output| output.text)
}

/// Checks a row's result against its expected text, with the live pid filled in.
fn check_row(row: &Row, git: &str, result: Result<String, FeatureError>, live: i64) {
    let substitute = |text: &'static str| {
        text.replace("<live>", &live.to_string())
            .replace("<git>", git)
    };
    match row.expected {
        Expected::Output(text) => {
            let output = result.unwrap_or_else(|error| panic!("row {} failed: {error}", row.name));
            assert_eq!(substitute(text), output, "row {}", row.name);
        }
        Expected::Failed(text) => {
            let error = result.expect_err("the row's check fails");
            match &error {
                FeatureError::Failed {
                    command, message, ..
                } => {
                    assert_eq!("doctor", command, "row {}", row.name);
                    assert_eq!(substitute(text), *message, "row {}", row.name);
                }
                other => panic!("row {} returned {other:?}", row.name),
            }
        }
    }
}

/// Proves every row of "Doctor change lines" in its own scratch root.
///
/// Covers: rust-doctor/doctor-change-lines
#[test]
fn doctor_change_lines() {
    let live = i64::from(std::process::id());
    let git = git_line();
    for row in ROWS {
        let root = scratch(row.name);
        managed_files(&root);
        git_init(&root);
        for (path, text) in row.files {
            write(
                &root.join("openspec/changes").join(path),
                &text.replace("<live>", &live.to_string()),
            );
        }
        let result = doctor(&root);
        check_row(row, &git, result, live);
    }
}

/// Proves doctor reads a lock left in an osq worktree.
///
/// Covers: rust-doctor/doctor-reads-every-worktree
#[test]
fn doctor_reads_every_worktree() {
    let base = scratch("doctor_reads_every_worktree");
    let worktrees = base.join("worktrees");
    fs::create_dir_all(&worktrees).unwrap();
    let repo = repository(&base, &worktrees);
    let worktree = worktrees.join("002-run");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "osq/002-run",
            worktree.to_str().unwrap(),
            "main",
        ],
    );
    let change = worktree.join("openspec/changes/002-run");
    write(&change.join(".run/approved"), "sha256:0001\n");
    write(&change.join(".run/running/1.pid"), DEAD);
    write(
        &repo.join("openspec/changes/002-run/.run/running/1.pid"),
        DEAD,
    );
    let git = git_line();
    let error = doctor(&repo).expect_err("the worktree lock is orphaned");
    match &error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!("doctor", command);
            assert_eq!(
                concat!(
                    "[ok] config: loaded (harness: agy)\n",
                    "[ok] managed-blocks: managed blocks valid\n",
                    "[fail] locks: orphaned lock(s): ",
                    "../worktrees/002-run/openspec/changes/002-run/.run/running/1.pid\n",
                    "[ok] archives: all archives valid\n",
                    "[ok] done-markers: all done markers verified\n",
                    "<git>\n",
                    "[warn] gitattributes: .gitattributes has no current osq line endings block; ",
                    "run osq init",
                )
                .replace("<git>", &git),
                message.as_str()
            );
        }
        other => panic!("doctor returned {other:?}"),
    }
}

/// Proves doctor reads a lock in a stacked approval folder no worktree names.
///
/// Covers: rust-doctor/doctor-reads-every-worktree
#[test]
fn doctor_reads_stacked_changes() {
    let base = scratch("doctor_reads_stacked_changes");
    let worktrees = base.join("worktrees");
    fs::create_dir_all(&worktrees).unwrap();
    let repo = repository(&base, &worktrees);
    write(
        &worktrees.join("repo/.stacked/040-stack/openspec/changes/040-stack/.run/running/1.pid"),
        DEAD,
    );
    let git = git_line();
    let error = doctor(&repo).expect_err("the stacked lock is orphaned");
    match &error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!("doctor", command);
            assert_eq!(
                concat!(
                    "[ok] config: loaded (harness: agy)\n",
                    "[ok] managed-blocks: managed blocks valid\n",
                    "[fail] locks: orphaned lock(s): ",
                    "../worktrees/repo/.stacked/040-stack/openspec/changes/040-stack/",
                    ".run/running/1.pid\n",
                    "[ok] archives: all archives valid\n",
                    "[ok] done-markers: all done markers verified\n",
                    "<git>\n",
                    "[warn] gitattributes: .gitattributes has no current osq line endings block; ",
                    "run osq init",
                )
                .replace("<git>", &git),
                message.as_str()
            );
        }
        other => panic!("doctor returned {other:?}"),
    }
}
