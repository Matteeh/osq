//! Proves the inbox reads every worktree's changes and lists archived work.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_inbox::InboxFeature;

/// The archived event line the waiting change carries.
const ARCHIVED_EVENT: &str = "{\"type\":\"archived\",\"timestamp\":\"2026-10-21T20:19:27.083Z\",\"data\":{\"archivePath\":\"openspec/changes/archive/002-wait\"}}\n";

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

/// Writes a change's proposal and its one task.
fn change(dir: &Path, title: Option<&str>) {
    let title_line = title.map_or_else(String::new, |title| format!("title: {title}\n"));
    write(
        &dir.join("proposal.md"),
        &format!("---\n{title_line}verify: cargo test\n---\n## Goal\n\nGoal.\n"),
    );
    write(
        &dir.join("tasks/1.md"),
        "---\ntitle: When run, it works\n---\n",
    );
}

/// Writes a change's approval marker.
fn approve(dir: &Path) {
    write(&dir.join(".run/approved"), "sha256:0001\n");
}

/// Writes a change-level regression marker with a reason.
fn change_marker(dir: &Path, reason: &str) {
    write(
        &dir.join(".run/regressed/change.md"),
        &format!("---\nreason: {reason}\n---\n"),
    );
}

/// Writes a task's dead event and dead marker.
fn dead_task(dir: &Path, reason: &str) {
    write(
        &dir.join(".run/events/1.jsonl"),
        &format!(
            "{{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{{\"attempt\":1}}}}\n\
             {{\"type\":\"dead\",\"timestamp\":\"2026-10-01T10:01:00.000Z\",\"data\":{{\"task\":\"1\",\"reason\":\"{reason}\"}}}}\n"
        ),
    );
    write(
        &dir.join(".run/dead/1.md"),
        &format!("---\nreason: {reason}\n---\n"),
    );
}

/// Writes the vcs-enabled `osq.toml` naming an empty worktree root.
fn write_vcs(repo: &Path, worktrees: &Path) {
    write(
        &repo.join("osq.toml"),
        &format!(
            "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\nworktreeRoot = \"{}\"\n",
            worktrees.display()
        ),
    );
}

/// Builds the scratch repository both worktree scenarios share.
fn repository(base: &Path) -> PathBuf {
    let repo = base.join("repo");
    fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    change(
        &repo.join("openspec/changes/001-draft"),
        Some("Draft change"),
    );
    commit(&repo, "main commit");
    repo
}

/// Adds one row's worktree on `osq/<folder>` and returns its path.
fn worktree(base: &Path, repo: &Path, folder: &str) -> PathBuf {
    let path = base.join("trees").join(folder);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let branch = format!("osq/{folder}");
    let target = path.to_str().unwrap();
    git(repo, &["worktree", "add", "-b", &branch, target, "main"]);
    path
}

/// Writes the six worktree rows the archived scenario describes.
fn rows(base: &Path, repo: &Path) {
    let wait = worktree(base, repo, "002-wait");
    let dir = wait.join("openspec/changes/archive/002-wait");
    change(&dir, Some("Waiting change"));
    approve(&dir);
    write(&dir.join(".run/events/change.jsonl"), ARCHIVED_EVENT);
    commit(&wait, "002");

    let steer = worktree(base, repo, "003-steer");
    let dir = steer.join("openspec/changes/archive/003-steer");
    change(&dir, None);
    approve(&dir);
    change_marker(&dir, "sync_verify_red");
    commit(&steer, "003");

    let missing = worktree(base, repo, "004-noapproved");
    let dir = missing.join("openspec/changes/archive/004-noapproved");
    change(&dir, Some("No approval"));
    commit(&missing, "004");

    let blocked = worktree(base, repo, "006-blocked");
    let dir = blocked.join("openspec/changes/archive/006-blocked");
    change(&dir, Some("Blocked archive"));
    approve(&dir);
    dead_task(&dir, "blocked");
    commit(&blocked, "006");

    let merged = worktree(base, repo, "007-merged");
    let dir = merged.join("openspec/changes/archive/007-merged");
    change(&dir, Some("Merged change"));
    approve(&dir);
    commit(&merged, "007");
    git(repo, &["merge", "osq/007-merged"]);

    let active = worktree(base, repo, "008-active");
    let dir = active.join("openspec/changes/008-active");
    change(&dir, Some("Active change"));
    approve(&dir);
    dead_task(&dir, "verify_red");
}

/// Writes an active change under a stacked approval root.
fn stacked_change(worktrees: &Path, repo: &Path, folder: &str) {
    let repo_name = repo.file_name().unwrap().to_str().unwrap();
    let dir = worktrees
        .join(repo_name)
        .join(".stacked")
        .join(folder)
        .join("openspec/changes")
        .join(folder);
    change(&dir, Some("Stacked change"));
}

/// Runs the inbox command on a root and returns its output text.
fn inbox_text(root: &Path) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::new()
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// The full text a needs-you group gives with empty running and landed groups.
fn needs_text(lines: &[&str]) -> String {
    let mut text = String::from("Needs you\n");
    for line in lines {
        text.push_str(line);
        text.push('\n');
    }
    text.push_str("Running\n  (none)\nLanded since last look\n  (none)\n");
    text
}

/// The five needs-you lines the worktree scenarios share.
fn worktree_lines() -> [&'static str; 5] {
    [
        "  001: Draft change — osq approve 001",
        "  002: Waiting change — archived, not landed — osq land 002",
        "  003: 003-steer — needs steering: regression (sync_verify_red) — osq plan 003",
        "  006: Blocked archive — needs steering: blocked (blocked) — osq plan 006",
        "  008: Active change — task 1: When run, it works — osq retry 008 1",
    ]
}

/// Proves that `osq.toml` that does not load fails the command.
///
/// Covers: rust-inbox/config-that-does-not-load
#[test]
fn config_that_does_not_load() {
    let root = scratch("inbox_config_that_does_not_load");
    write(&root.join("osq.toml"), "[vcs]\nenabled = \"yes\"\n");
    let error = InboxFeature::new()
        .run(&Invocation::new(&root, "inbox", Vec::new()))
        .expect_err("the config does not load");
    assert!(matches!(error, FeatureError::Failed { .. }));
    assert!(error.to_string().starts_with("inbox failed: "), "{error}");
    assert!(error.to_string().contains("vcs.enabled"), "{error}");
}

/// Proves the worktree changes with vcs on and off.
///
/// Covers: rust-inbox/worktree-changes-with-vcs-on-and-off
#[test]
fn worktree_changes_with_vcs_on_and_off() {
    let base = scratch("inbox_worktree_changes_with_vcs_on_and_off");
    let repo = repository(&base);
    let worktrees = base.join("worktrees");
    fs::create_dir_all(&worktrees).unwrap();
    rows(&base, &repo);
    write_vcs(&repo, &worktrees);
    assert_eq!(inbox_text(&repo), needs_text(&worktree_lines()));
    fs::remove_file(repo.join("osq.toml")).unwrap();
    assert_eq!(
        inbox_text(&repo),
        needs_text(&["  001: Draft change — osq approve 001"])
    );
}

/// Proves stacked changes are read and root archives are not worktree archives.
///
/// Covers: rust-inbox/worktree-changes-with-vcs-on-and-off
#[test]
fn stacked_changes_are_read() {
    let base = scratch("inbox_stacked_changes_are_read");
    let repo = repository(&base);
    let worktrees = base.join("worktrees");
    fs::create_dir_all(&worktrees).unwrap();

    git(&repo, &["checkout", "-b", "work"]);
    let dir = repo.join("openspec/changes/archive/030-root");
    change(&dir, Some("Root archive"));
    approve(&dir);
    commit(&repo, "root archive");
    git(&repo, &["branch", "osq/030-root"]);

    stacked_change(&worktrees, &repo, "040-stack");
    write_vcs(&repo, &worktrees);
    assert_eq!(
        inbox_text(&repo),
        needs_text(&[
            "  001: Draft change — osq approve 001",
            "  040: Stacked change — osq approve 040",
        ])
    );
}

/// Proves the archived worktree changes and their order.
///
/// Covers: rust-inbox/archived-worktree-changes
#[test]
fn archived_worktree_changes() {
    let base = scratch("inbox_archived_worktree_changes");
    let repo = repository(&base);
    let worktrees = base.join("worktrees");
    fs::create_dir_all(&worktrees).unwrap();
    rows(&base, &repo);
    write_vcs(&repo, &worktrees);
    assert_eq!(inbox_text(&repo), needs_text(&worktree_lines()));
}
