//! Proves the worktree cleanup after a land and for a change already landed.

mod support;

use std::fmt::Write as _;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::{FIXTURE_FOLDER, LandRepo, copy_tree, fixture};

/// The paths a land commit reports, in their order.
const CHANGED: [&str; 12] = [
    "openspec/changes/archive/001-alpha-orders/.run/approved",
    "openspec/changes/archive/001-alpha-orders/.run/approver",
    "openspec/changes/archive/001-alpha-orders/.run/base",
    "openspec/changes/archive/001-alpha-orders/.run/done/1",
    "openspec/changes/archive/001-alpha-orders/.run/done/2",
    "openspec/changes/archive/001-alpha-orders/.run/events/1.jsonl",
    "openspec/changes/archive/001-alpha-orders/.run/events/2.jsonl",
    "openspec/changes/archive/001-alpha-orders/.run/events/change.jsonl",
    "openspec/changes/archive/001-alpha-orders/proposal.md",
    "openspec/changes/archive/001-alpha-orders/specs/orders/spec.md",
    "openspec/changes/archive/001-alpha-orders/tasks.md",
    "src/one.txt",
];

/// A land repository whose worktree sits at the configured cleanup path.
struct Fixture {
    /// The repository.
    repo: LandRepo,
    /// The worktree's configured path.
    path: PathBuf,
}

/// Builds a repository with the fixture change in a worktree at its cleanup path.
fn setup(name: &str) -> Fixture {
    let repo = LandRepo::new(name);
    repo.write(repo.checkout(), "osq.toml", config(&repo));
    repo.write(
        repo.checkout(),
        ".gitignore",
        "node_modules/\ntarget/\n.run/logs/\n",
    );
    repo.commit(
        repo.checkout(),
        "ignore build output",
        &["osq.toml", ".gitignore"],
    );
    let path = worktree_path(&repo);
    fs::create_dir_all(path.parent().expect("the worktree has a parent"))
        .expect("the worktree's folder is created");
    let branch = format!("osq/{FIXTURE_FOLDER}");
    repo.git(
        repo.checkout(),
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            &branch,
            path.to_str().expect("the worktree path is text"),
            "main",
        ],
    );
    repo.write(&path, "src/one.txt", "two\n");
    copy_tree(
        &fixture(&format!("land-change/{FIXTURE_FOLDER}")),
        &path.join("openspec/changes/archive").join(FIXTURE_FOLDER),
    );
    repo.commit_all(&path, "work on the fixture change");
    Fixture { repo, path }
}

/// The `osq.toml` naming the configured worktree root.
fn config(repo: &LandRepo) -> String {
    format!(
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\nworktreeRoot = \"{}\"\n",
        repo.scratch().join("wt").display()
    )
}

/// The fixture change's configured worktree path.
fn worktree_path(repo: &LandRepo) -> PathBuf {
    repo.scratch()
        .join("wt")
        .join("checkout")
        .join(FIXTURE_FOLDER)
}

/// Adds a commit to `main` that makes the fixture change look landed.
fn land_on_main(repo: &LandRepo) {
    let path = format!("openspec/changes/archive/{FIXTURE_FOLDER}/proposal.md");
    repo.write(repo.checkout(), &path, "---\ntitle: A\n---\n");
    repo.commit(repo.checkout(), "land the fixture change", &[&path]);
}

/// The commit a land output names.
fn landed_commit(output: &str) -> String {
    output
        .lines()
        .next()
        .and_then(|line| line.rsplit_once(" as "))
        .map(|(_, commit)| commit.to_owned())
        .expect("the output names the land commit")
}

/// The success lines from `Kept branch` on, without the final newline.
fn kept_lines(repo: &LandRepo) -> String {
    let mut lines = format!("Kept branch osq/{FIXTURE_FOLDER}\n");
    for path in CHANGED {
        writeln!(lines, "Changed {}", repo.checkout().join(path).display())
            .expect("a string writes");
    }
    lines.trim_end_matches('\n').to_owned()
}

/// The message of a `Failed` land error.
fn message(error: &FeatureError) -> &str {
    match error {
        FeatureError::Failed { message, .. } => message,
        other => panic!("expected a Failed error, got {other:?}"),
    }
}

/// Whether git lists `path` as a worktree.
fn listed(repo: &LandRepo, path: &Path) -> bool {
    repo.git(repo.checkout(), &["worktree", "list", "--porcelain"])
        .contains(&format!("worktree {}", path.display()))
}

/// Proves every row of "Cleanup outcomes".
///
/// Covers: rust-land/cleanup-outcomes
#[test]
fn cleanup_outcomes() {
    ignored_file_is_removed();
    logs_are_copied();
    checkout_log_is_kept();
    edited_checkout_copy_is_kept();
    a_failed_removal_keeps_the_land_commit();
}

/// Proves an ignored file in the worktree is removed with it.
fn ignored_file_is_removed() {
    let ignored = setup("cleanup-ignored");
    ignored
        .repo
        .write(&ignored.path, "node_modules/pkg/index.js", "built\n");
    let output = ignored.repo.run("1").expect("the land succeeds").text;
    let commit = landed_commit(&output);
    let expected = format!(
        "Landed {FIXTURE_FOLDER} as {commit}\nRemoved worktree {}\n{}\n",
        ignored.path.display(),
        kept_lines(&ignored.repo)
    );
    assert_eq!(output, expected);
    assert!(!ignored.path.exists(), "no folder is left at the path");
    assert!(
        !listed(&ignored.repo, &ignored.path),
        "git drops the worktree"
    );
}

/// Proves the worktree's archived logs are copied into the checkout.
fn logs_are_copied() {
    let logs = setup("cleanup-logs");
    write_log(&logs.repo, &logs.path, "probe");
    logs.repo.run("1").expect("the land succeeds");
    assert_eq!(
        logs.repo.read(logs.repo.checkout(), &log_path()),
        "probe",
        "the log is copied into the checkout"
    );
    assert_eq!(
        logs.repo
            .git(logs.repo.checkout(), &["status", "--porcelain"]),
        "",
        "the copied log is ignored"
    );
}

/// Proves a log already in the checkout keeps its bytes.
fn checkout_log_is_kept() {
    let kept = setup("cleanup-kept-log");
    kept.repo.write(kept.repo.checkout(), &log_path(), "kept");
    write_log(&kept.repo, &kept.path, "probe");
    kept.repo.run("1").expect("the land succeeds");
    assert_eq!(
        kept.repo.read(kept.repo.checkout(), &log_path()),
        "kept",
        "the checkout's log is kept"
    );
}

/// Proves the checkout's active change folder is left alone.
fn edited_checkout_copy_is_kept() {
    let edited = setup("cleanup-edited-copy");
    let path = format!("openspec/changes/{FIXTURE_FOLDER}/notes.md");
    edited.repo.write(edited.repo.checkout(), &path, "notes\n");
    edited.repo.run("1").expect("the land succeeds");
    assert_eq!(
        edited.repo.read(edited.repo.checkout(), &path),
        "notes\n",
        "the change's checkout folder is untouched"
    );
}

/// Proves a step that cannot delete the worktree fails the land loudly.
fn a_failed_removal_keeps_the_land_commit() {
    let locked = setup("cleanup-locked");
    let folder = locked.path.join("node_modules/locked");
    locked
        .repo
        .write(&locked.path, "node_modules/locked/f", "locked\n");
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o500))
        .expect("the locked folder's permissions are removed");
    let result = locked.repo.run("1");
    if folder.exists() {
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o755))
            .expect("the locked folder's permissions are put back");
    }
    let error = result.expect_err("the worktree cannot be removed");
    let text = message(&error);
    let commit = landed_commit(text);
    assert!(
        text.starts_with(&format!(
            "Landed {FIXTURE_FOLDER} as {commit}\nCould not remove worktree {}: ",
            locked.path.display()
        )),
        "{text}"
    );
    assert!(
        text.ends_with(&format!("\n{}", kept_lines(&locked.repo))),
        "{text}"
    );
    assert_eq!(
        locked.repo.head(locked.repo.checkout()),
        commit,
        "main's HEAD is the land commit"
    );
}

/// The worktree's archived log file, relative to a repository.
fn log_path() -> String {
    format!("openspec/changes/archive/{FIXTURE_FOLDER}/.run/logs/probe.log")
}

/// Writes an ignored verify log into the worktree's archived folder.
fn write_log(repo: &LandRepo, path: &Path, contents: &str) {
    repo.write(
        path,
        &format!("openspec/changes/archive/{FIXTURE_FOLDER}/.run/logs/.gitignore"),
        "*\n",
    );
    repo.write(path, &log_path(), contents);
}

/// Proves every row of "Cleanup of a landed change".
///
/// Covers: rust-land/cleanup-of-a-landed-change
#[test]
fn cleanup_of_a_landed_change() {
    let remaining = setup("landed-cleanup-remaining");
    land_on_main(&remaining.repo);
    let before = remaining.repo.head(remaining.repo.checkout());
    let output = remaining
        .repo
        .run("1")
        .expect("the landed change is reported")
        .text;
    assert_eq!(
        output,
        format!(
            "{FIXTURE_FOLDER} has already landed\nRemoved worktree {}\n",
            remaining.path.display()
        )
    );
    assert_eq!(
        remaining.repo.head(remaining.repo.checkout()),
        before,
        "main gains no commit"
    );

    let twice = setup("landed-cleanup-twice");
    land_on_main(&twice.repo);
    twice.repo.run("1").expect("the first land cleans up");
    let output = twice
        .repo
        .run("1")
        .expect("the second land finds nothing")
        .text;
    assert_eq!(
        output,
        format!("{FIXTURE_FOLDER} has already landed; nothing to clean up\n")
    );

    let leftover = setup("landed-cleanup-leftover");
    land_on_main(&leftover.repo);
    leftover.repo.git(
        leftover.repo.checkout(),
        &[
            "worktree",
            "remove",
            "--force",
            leftover.path.to_str().expect("the worktree path is text"),
        ],
    );
    leftover.repo.write(&leftover.path, "target/big", "big\n");
    let output = leftover
        .repo
        .run("1")
        .expect("the leftover is removed")
        .text;
    assert_eq!(
        output,
        format!(
            "{FIXTURE_FOLDER} has already landed\nRemoved worktree {}\n",
            leftover.path.display()
        )
    );
    assert!(!leftover.path.exists(), "no folder is left at the path");

    let stale = setup("landed-cleanup-stale");
    land_on_main(&stale.repo);
    fs::remove_dir_all(&stale.path).expect("the worktree's folder is deleted");
    assert!(
        listed(&stale.repo, &stale.path),
        "git still lists the worktree"
    );
    let output = stale
        .repo
        .run("1")
        .expect("the stale record is pruned")
        .text;
    assert_eq!(
        output,
        format!(
            "{FIXTURE_FOLDER} has already landed\nRemoved worktree {}\n",
            stale.path.display()
        )
    );
    assert!(!listed(&stale.repo, &stale.path), "git drops the worktree");
    a_failed_landed_cleanup_fails();
}

/// Proves a cleanup that fails for a landed change fails the land.
fn a_failed_landed_cleanup_fails() {
    let locked = setup("landed-cleanup-locked");
    land_on_main(&locked.repo);
    let folder = locked.path.join("node_modules/locked");
    locked
        .repo
        .write(&locked.path, "node_modules/locked/f", "locked\n");
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o500))
        .expect("the locked folder's permissions are removed");
    let result = locked.repo.run("1");
    if folder.exists() {
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o755))
            .expect("the locked folder's permissions are put back");
    }
    let error = result.expect_err("the worktree cannot be removed");
    let text = message(&error);
    assert!(
        text.starts_with(&format!(
            "{FIXTURE_FOLDER} has already landed\nCould not remove worktree {}: ",
            locked.path.display()
        )),
        "{text}"
    );
    assert!(!text.ends_with('\n'), "the message keeps no final newline");
}
