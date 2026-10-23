//! Proves the sync that takes a newer default branch into a change's branch.

mod support;

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::process::{Command, Output};

use serde_json::{Value, json};
use support::{ChangeTree, LandRepo};

/// The archived folder of a change.
fn archive(folder: &str) -> String {
    format!("openspec/changes/archive/{folder}")
}

/// The change stream inside a change's archived folder.
fn events(folder: &str) -> String {
    format!("{}/.run/events/change.jsonl", archive(folder))
}

/// The stop marker inside a change's archived folder.
fn regressed(folder: &str) -> String {
    format!("{}/.run/regressed/change.md", archive(folder))
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

/// The commits a rev names, itself first.
fn parents(repo: &LandRepo, rev: &str) -> Vec<String> {
    repo.git(repo.checkout(), &["rev-list", "--parents", "-n", "1", rev])
        .split_whitespace()
        .map(str::to_owned)
        .collect()
}

/// The paths a commit changes.
fn changed_paths(repo: &LandRepo, change: &ChangeTree, commit: &str) -> Vec<String> {
    let mut paths: Vec<String> = repo
        .git(
            &change.path,
            &["diff-tree", "--no-commit-id", "--name-only", "-r", commit],
        )
        .lines()
        .map(str::to_owned)
        .collect();
    paths.sort();
    paths
}

/// Asserts the change's worktree has no status entries.
fn assert_clean(repo: &LandRepo, change: &ChangeTree) {
    assert_eq!(
        repo.git(&change.path, &["status", "--porcelain"]).trim(),
        "",
        "the worktree is clean"
    );
}

/// The orders spec with the requirement `name` and the given body text.
fn orders_spec_body(name: &str, body: &str) -> String {
    let lower = name.to_lowercase();
    format!(
        "# orders Specification\n\n## Purpose\n\nOrders.\n\n## Requirements\n\n### Requirement: {name}\n{body}\n\n#### Scenario: {name} works\n- **WHEN** {lower}\n- **THEN** {lower}\n"
    )
}

/// The orders spec with the requirement `name` and its lower-case body.
fn orders_spec(name: &str) -> String {
    let lower = name.to_lowercase();
    orders_spec_body(name, &format!("The system SHALL {lower}."))
}

/// A delta that modifies the requirement `Order totals`.
fn order_totals_delta() -> String {
    "## MODIFIED Requirements\n\n### Requirement: Order totals\nThe system SHALL total orders twice.\n\n#### Scenario: Order totals works\n- **WHEN** order totals\n- **THEN** order totals\n".to_owned()
}

/// Writes a Cargo workspace root at `dir`.
fn write_workspace(repo: &LandRepo, dir: &std::path::Path) {
    repo.write(
        dir,
        "Cargo.toml",
        "[workspace]\nmembers = [\"crates/*\"]\nresolver = \"2\"\n",
    );
}

/// Writes one path-only crate named `name` at `dir`.
fn write_crate(repo: &LandRepo, dir: &std::path::Path, name: &str) {
    repo.write(
        dir,
        &format!("crates/{name}/Cargo.toml"),
        format!("[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n"),
    );
    repo.write(dir, &format!("crates/{name}/src/lib.rs"), "");
}

/// Runs `cargo` in `dir`, asserting that it exits 0.
fn cargo(repo: &LandRepo, dir: &std::path::Path, args: &[&str]) -> Output {
    let output = Command::new("cargo")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("cargo starts");
    assert!(
        output.status.success(),
        "cargo {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    let _ = repo;
    output
}

/// Writes an executable `pre-commit` hook that exits 1 and points git at it.
fn install_failing_hook(repo: &LandRepo) {
    repo.write(repo.scratch(), "hooks/pre-commit", "#!/bin/sh\nexit 1\n");
    let hook = repo.scratch().join("hooks/pre-commit");
    let mut permissions = fs::metadata(&hook).expect("the hook reads").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&hook, permissions).expect("the hook is executable");
    repo.git(
        repo.checkout(),
        &[
            "config",
            "core.hooksPath",
            repo.scratch().join("hooks").to_str().expect("a text path"),
        ],
    );
}

/// Proves the first row of "Sync before the land": the fixture change.
///
/// Covers: rust-land/sync-before-the-land
#[test]
fn sync_before_the_land_fixture() {
    let repo = LandRepo::new("sync-before-fixture");
    let change = repo.add_fixture_change();
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);
    let old_main = repo.head(repo.checkout());

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    let branch = repo.branch_head("osq/001-alpha-orders");
    assert_eq!(
        parents(&repo, &branch),
        vec![branch.clone(), old_tip, old_main],
        "the sync commit's parents"
    );
    assert_eq!(
        repo.message(&branch),
        "osq: 001 sync main\n\nOsq-Change: 001-alpha-orders\n"
    );
    let commit = landed_commit(&output);
    assert_eq!(
        repo.tree(repo.checkout(), &commit),
        repo.tree(&change.path, &branch),
        "the land tree is the branch tip's"
    );
    assert!(
        repo.message(&commit)
            .contains(&format!("Osq-Head: {branch}")),
        "the land names the sync commit"
    );
    let event: Value = serde_json::from_str(
        repo.read(&change.path, &events("001-alpha-orders"))
            .lines()
            .last()
            .expect("the events have a last line"),
    )
    .expect("the synced event is JSON");
    assert_eq!(event["type"], "synced");
    assert_eq!(event["data"]["defaultBranch"], "main");
    assert_eq!(event["data"]["commits"], 1);
    assert_eq!(repo.read(repo.checkout(), "other.txt"), "other\n");
    assert_eq!(repo.read(repo.checkout(), "src/one.txt"), "two\n");
}

/// Proves the living spec row of "Sync before the land".
///
/// Covers: rust-land/sync-before-the-land
#[test]
fn sync_before_the_land_living_spec() {
    let repo = LandRepo::new("sync-before-spec");
    let alpha = orders_spec("Alpha");
    let beta = orders_spec("Beta");
    let delta = "## ADDED Requirements\n\n### Requirement: Alpha\nThe system SHALL alpha.\n\n#### Scenario: Alpha works\n- **WHEN** alpha\n- **THEN** alpha\n";
    let change = repo.add_change_with(
        "001-alpha-orders",
        &[
            ("proposal.md", b"---\ntitle: A\n---\n## Verify\n\nx\n"),
            ("specs/orders/spec.md", delta.as_bytes()),
        ],
    );
    repo.write(&change.path, "openspec/specs/orders/spec.md", &alpha);
    repo.commit_all(&change.path, "branch adds alpha");
    repo.write(repo.checkout(), "openspec/specs/orders/spec.md", &beta);
    repo.commit(
        repo.checkout(),
        "main adds beta",
        &["openspec/specs/orders/spec.md"],
    );

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    let merged = repo.read(&change.path, "openspec/specs/orders/spec.md");
    assert_eq!(merged.matches("### Requirement: Alpha").count(), 1);
    assert_eq!(merged.matches("### Requirement: Beta").count(), 1);
    for marker in ["<<<<<<<", "=======", ">>>>>>>"] {
        assert!(
            !merged.lines().any(|line| line.starts_with(marker)),
            "{marker} remains"
        );
    }
}

/// Proves the archive row of "Sync before the land".
///
/// Covers: rust-land/sync-before-the-land
#[test]
fn sync_before_the_land_archive_conflict() {
    let repo = LandRepo::new("sync-before-archive");
    let change = repo.add_fixture_change();
    let notes = "openspec/changes/archive/000-base/notes.md";
    repo.write(&change.path, notes, "branch\n");
    repo.commit_all(&change.path, "branch adds notes");
    repo.write(repo.checkout(), notes, "main\n");
    repo.commit(repo.checkout(), "main adds notes", &[notes]);

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    assert_eq!(repo.read(&change.path, notes), "main\n");
}

/// Proves "Sync rebuilds a conflicting lock file".
///
/// Covers: rust-land/sync-rebuilds-a-conflicting-lock-file
#[test]
fn sync_rebuilds_a_conflicting_lock_file() {
    let repo = LandRepo::new("sync-rebuild-lock");
    write_workspace(&repo, repo.checkout());
    write_crate(&repo, repo.checkout(), "base");
    cargo(&repo, repo.checkout(), &["generate-lockfile", "--offline"]);
    repo.commit_all(repo.checkout(), "main workspace");
    let change = repo.add_fixture_change();
    write_crate(&repo, &change.path, "alpha");
    cargo(&repo, &change.path, &["generate-lockfile", "--offline"]);
    repo.commit_all(&change.path, "branch adds alpha");
    write_crate(&repo, repo.checkout(), "beta");
    cargo(&repo, repo.checkout(), &["generate-lockfile", "--offline"]);
    repo.commit_all(repo.checkout(), "main adds beta");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    let lock = repo.read(&change.path, "Cargo.lock");
    for name in ["alpha", "base", "beta"] {
        assert!(
            lock.contains(&format!("name = \"{name}\"")),
            "{name} is locked"
        );
    }
    assert!(!lock.lines().any(|line| line.starts_with("<<<<<<<")));
    cargo(
        &repo,
        &change.path,
        &["metadata", "--offline", "--locked", "--format-version", "1"],
    );
}

/// The conflict message a code conflict gives.
fn code_conflict() -> String {
    "001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main".to_owned()
}

/// Proves the first row of "Sync stops": a code conflict.
///
/// Covers: rust-land/sync-stops
#[test]
fn sync_stops_on_a_code_conflict() {
    let repo = LandRepo::new("sync-stops-code");
    let change = repo.add_fixture_change();
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    repo.write(repo.checkout(), "src/one.txt", "main\n");
    repo.commit(repo.checkout(), "main edits one", &["src/one.txt"]);
    let old_main = repo.head(repo.checkout());

    let error = repo.run("1").expect_err("the land stops");
    let expected = code_conflict();
    assert_eq!(error.to_string(), format!("land failed: {expected}"));
    assert_eq!(repo.head(repo.checkout()), old_main, "main unchanged");
    let branch = repo.branch_head("osq/001-alpha-orders");
    assert_ne!(branch, old_tip, "the stop is recorded");
    assert_eq!(repo.message(&branch), "osq: 001 land stopped\n");
    assert_clean(&repo, &change);
}

/// Proves the second row of "Sync stops": a code conflict hides a lock file.
///
/// Covers: rust-land/sync-stops
#[test]
fn sync_stops_on_code_before_a_lock_file() {
    let repo = LandRepo::new("sync-stops-code-lock");
    let change = repo.add_fixture_change();
    repo.write(&change.path, "sub/Cargo.lock", "branch\n");
    repo.commit_all(&change.path, "branch adds lock");
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    repo.write(repo.checkout(), "src/one.txt", "main\n");
    repo.write(repo.checkout(), "sub/Cargo.lock", "main\n");
    repo.commit(
        repo.checkout(),
        "main edits both",
        &["src/one.txt", "sub/Cargo.lock"],
    );

    let error = repo.run("1").expect_err("the land stops");
    assert_eq!(
        error.to_string(),
        format!("land failed: {}", code_conflict())
    );
    let branch = repo.branch_head("osq/001-alpha-orders");
    assert_ne!(branch, old_tip, "the stop is recorded");
    assert_eq!(repo.message(&branch), "osq: 001 land stopped\n");
    assert_clean(&repo, &change);
}

/// Proves the third row of "Sync stops": a lock file that cannot rebuild.
///
/// Covers: rust-land/sync-stops
#[test]
fn sync_stops_on_a_failed_rebuild() {
    let repo = LandRepo::new("sync-stops-rebuild");
    let change = repo.add_fixture_change();
    repo.write(&change.path, "sub/Cargo.lock", "branch\n");
    repo.commit_all(&change.path, "branch adds lock");
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    repo.write(repo.checkout(), "sub/Cargo.toml", "[package\n");
    repo.write(repo.checkout(), "sub/Cargo.lock", "main\n");
    repo.commit(
        repo.checkout(),
        "main breaks the manifest",
        &["sub/Cargo.toml", "sub/Cargo.lock"],
    );

    let error = repo.run("1").expect_err("the land stops");
    let message = error.to_string();
    assert!(
        message.starts_with(
            "land failed: 001-alpha-orders: rebuilding sub/Cargo.lock failed on osq/001-alpha-orders merged with main:\n"
        ),
        "{message}"
    );
    assert!(
        message.contains("Cargo.toml"),
        "the output tail is kept: {message}"
    );
    assert_eq!(
        repo.branch_head("osq/001-alpha-orders"),
        old_tip,
        "nothing is recorded"
    );
    assert_clean(&repo, &change);
}

/// Proves the fourth row of "Sync stops": a failing `vcs.prepare`.
///
/// Covers: rust-land/sync-stops
#[test]
fn sync_stops_on_a_failed_prepare() {
    let repo = LandRepo::new("sync-stops-prepare");
    let change = repo.add_fixture_change();
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    let toml = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\nprepare = \"echo nope; exit 1\"\n";
    repo.write(repo.checkout(), "osq.toml", toml);
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(
        repo.checkout(),
        "main adds prepare",
        &["osq.toml", "other.txt"],
    );

    let error = repo.run("1").expect_err("the land stops");
    assert_eq!(
        error.to_string(),
        format!(
            "land failed: prepare failed in worktree {} on branch osq/001-alpha-orders:\nnope\n",
            change.path.display()
        )
    );
    assert_eq!(
        repo.branch_head("osq/001-alpha-orders"),
        old_tip,
        "nothing is recorded"
    );
    assert_clean(&repo, &change);
}

/// Proves the fifth row of "Sync stops": the sync commit fails.
///
/// Covers: rust-land/sync-stops
#[test]
fn sync_stops_on_a_failed_commit() {
    let repo = LandRepo::new("sync-stops-commit");
    let change = repo.add_fixture_change();
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);
    let old_main = repo.head(repo.checkout());
    install_failing_hook(&repo);

    let error = repo.run("1").expect_err("the land stops");
    let message = error.to_string();
    let display = message
        .strip_prefix("land failed: ")
        .expect("the failure names land");
    assert!(display.starts_with("git "), "{display}");
    assert!(display.contains(" failed: "), "{display}");
    assert_eq!(
        repo.branch_head("osq/001-alpha-orders"),
        old_tip,
        "nothing is recorded"
    );
    assert_eq!(repo.head(repo.checkout()), old_main, "main unchanged");
    assert_clean(&repo, &change);
}

/// The message "Requirement changed since approval" gives.
fn requirement_changed() -> String {
    "001-alpha-orders: main changed requirements this change rewrites since it was approved: orders: Order totals; run osq plan 001 to revise the plan against main".to_owned()
}

/// Cuts a change from `base` whose archived delta modifies `Order totals`.
fn requirement_change(repo: &LandRepo, base: &str) -> ChangeTree {
    let change = repo.add_fixture_change();
    repo.write(
        &change.path,
        &format!("{}/.run/base", archive("001-alpha-orders")),
        format!("{base}\n"),
    );
    repo.write(
        &change.path,
        &format!("{}/specs/orders/spec.md", archive("001-alpha-orders")),
        order_totals_delta(),
    );
    repo.commit_all(&change.path, "archive the order totals delta");
    change
}

/// Proves the first row of "Requirement changed since approval".
///
/// Covers: rust-land/requirement-changed-since-approval
#[test]
fn requirement_changed_without_a_requirements_base() {
    let repo = LandRepo::new("requirement-changed-base");
    repo.write(
        repo.checkout(),
        "openspec/specs/orders/spec.md",
        orders_spec("Order totals"),
    );
    repo.commit_all(repo.checkout(), "main adds order totals");
    let base = repo.head(repo.checkout());
    let change = requirement_change(&repo, &base);
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    repo.write(
        repo.checkout(),
        "openspec/specs/orders/spec.md",
        orders_spec_body("Order totals", "The system SHALL total orders again."),
    );
    repo.commit_all(repo.checkout(), "main changes order totals");
    let old_main = repo.head(repo.checkout());

    let error = repo.run("1").expect_err("the land stops");
    let expected = requirement_changed();
    assert_eq!(error.to_string(), format!("land failed: {expected}"));
    let branch = repo.branch_head("osq/001-alpha-orders");
    assert_ne!(branch, old_tip, "the stop is recorded");
    assert_eq!(repo.message(&branch), "osq: 001 land stopped\n");
    assert_eq!(
        repo.read(&change.path, &regressed("001-alpha-orders")),
        format!("---\nreason: requirement_changed\n---\n{expected}\n")
    );
    assert_eq!(repo.head(repo.checkout()), old_main, "main unchanged");
    assert_clean(&repo, &change);
}

/// Proves the second row of "Requirement changed since approval".
///
/// Covers: rust-land/requirement-changed-since-approval
#[test]
fn requirement_changed_with_a_requirements_base() {
    let repo = LandRepo::new("requirement-changed-pinned");
    repo.write(
        repo.checkout(),
        "openspec/specs/orders/spec.md",
        orders_spec("Order totals"),
    );
    repo.commit_all(repo.checkout(), "main adds order totals");
    let base = repo.head(repo.checkout());
    let change = requirement_change(&repo, &base);
    repo.write(
        repo.checkout(),
        "openspec/specs/orders/spec.md",
        orders_spec_body("Order totals", "The system SHALL total orders again."),
    );
    repo.commit_all(repo.checkout(), "main changes order totals");
    let changed = repo.head(repo.checkout());
    repo.write(
        &change.path,
        &format!("{}/.run/requirements-base", archive("001-alpha-orders")),
        format!("{changed}\n"),
    );
    repo.commit_all(&change.path, "pin the requirements base");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
}

/// Proves "A code conflict is recorded".
///
/// Covers: rust-land/a-code-conflict-is-recorded
#[test]
fn a_code_conflict_is_recorded() {
    let repo = LandRepo::new("code-conflict-recorded");
    let change = repo.add_fixture_change();
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    let before = repo.read(&change.path, &events("001-alpha-orders"));
    repo.write(repo.checkout(), "src/one.txt", "main\n");
    repo.commit(repo.checkout(), "main edits one", &["src/one.txt"]);
    let old_main = repo.head(repo.checkout());

    let error = repo.run("1").expect_err("the land stops");
    let expected = code_conflict();
    assert_eq!(error.to_string(), format!("land failed: {expected}"));
    let branch = repo.branch_head("osq/001-alpha-orders");
    assert_eq!(
        parents(&repo, &branch),
        vec![branch.clone(), old_tip],
        "the stop commit's only parent"
    );
    assert_eq!(repo.message(&branch), "osq: 001 land stopped\n");
    assert_eq!(
        changed_paths(&repo, &change, &branch),
        vec![
            format!("{}/.run/events/change.jsonl", archive("001-alpha-orders")),
            regressed("001-alpha-orders"),
        ]
    );
    assert_eq!(
        repo.read(&change.path, &regressed("001-alpha-orders")),
        format!("---\nreason: sync_conflict\n---\n{expected}\n")
    );
    let after = repo.read(&change.path, &events("001-alpha-orders"));
    let added = &after[before.len()..];
    assert_eq!(added.lines().count(), 1);
    let event: Value = serde_json::from_str(added.trim()).expect("the regressed event is JSON");
    assert_eq!(event["type"], "regressed");
    assert_eq!(
        event["data"],
        json!({"task": "change", "reason": "sync_conflict", "output": expected})
    );
    assert_eq!(repo.head(repo.checkout()), old_main, "main unchanged");
    assert_clean(&repo, &change);
}

/// Proves "A record that cannot commit".
///
/// Covers: rust-land/a-record-that-cannot-commit
#[test]
fn a_record_that_cannot_commit() {
    let repo = LandRepo::new("record-cannot-commit");
    let change = repo.add_fixture_change();
    let old_tip = repo.branch_head("osq/001-alpha-orders");
    let before = repo.read(&change.path, &events("001-alpha-orders"));
    repo.write(repo.checkout(), "src/one.txt", "main\n");
    repo.commit(repo.checkout(), "main edits one", &["src/one.txt"]);
    let old_main = repo.head(repo.checkout());
    install_failing_hook(&repo);

    let error = repo.run("1").expect_err("the land stops");
    let expected = code_conflict();
    let prefix = format!("land failed: {expected}\nosq could not record the stop: ");
    let message = error.to_string();
    assert!(message.starts_with(&prefix), "{message}");
    let display = &message[prefix.len()..];
    assert!(display.starts_with("git "), "{display}");
    assert!(display.contains(" failed: "), "{display}");
    assert_eq!(repo.branch_head("osq/001-alpha-orders"), old_tip);
    assert!(!repo.exists(&change.path, &regressed("001-alpha-orders")));
    assert_eq!(
        repo.read(&change.path, &events("001-alpha-orders")),
        before,
        "the events keep their bytes"
    );
    assert_eq!(repo.head(repo.checkout()), old_main, "main unchanged");
    assert_clean(&repo, &change);
}

/// Proves a living spec conflict outside the change's delta is resolved.
///
/// Covers: rust-land/sync-before-the-land
#[test]
fn sync_resolves_a_living_spec_outside_the_delta() {
    let repo = LandRepo::new("sync-resolves-other-spec");
    let change = repo.add_fixture_change();
    let branch = orders_spec_body("Other", "The system SHALL branch.");
    let main = orders_spec_body("Other", "The system SHALL main.");
    repo.write(&change.path, "openspec/specs/other/spec.md", &branch);
    repo.commit_all(&change.path, "branch adds other");
    repo.write(repo.checkout(), "openspec/specs/other/spec.md", &main);
    repo.commit(
        repo.checkout(),
        "main adds other",
        &["openspec/specs/other/spec.md"],
    );

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    assert_eq!(
        repo.read(&change.path, "openspec/specs/other/spec.md"),
        main,
        "the default branch's copy wins"
    );
}

/// Proves a delta-only capability is written and committed by the sync.
///
/// Covers: rust-land/sync-before-the-land
#[test]
fn sync_commits_a_delta_only_capability() {
    let repo = LandRepo::new("sync-delta-only-capability");
    let delta = "## ADDED Requirements\n\n### Requirement: Fresh\nThe system SHALL fresh.\n\n#### Scenario: Fresh works\n- **WHEN** fresh\n- **THEN** fresh\n";
    repo.add_change_with(
        "001-alpha-orders",
        &[("specs/fresh/spec.md", delta.as_bytes())],
    );
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    let fresh = repo.read(repo.checkout(), "openspec/specs/fresh/spec.md");
    assert!(fresh.contains("### Requirement: Fresh"), "{fresh}");
}

/// Proves the sync removes a living spec the default branch deleted.
///
/// Covers: rust-land/sync-before-the-land
#[test]
fn sync_removes_a_deleted_living_spec() {
    let repo = LandRepo::new("sync-removes-deleted-spec");
    repo.write(
        repo.checkout(),
        "openspec/specs/orders/spec.md",
        orders_spec("Order totals"),
    );
    repo.commit_all(repo.checkout(), "main adds order totals");
    let change = repo.add_fixture_change();
    repo.write(
        &change.path,
        "openspec/specs/orders/spec.md",
        orders_spec_body("Order totals", "The system SHALL branch."),
    );
    repo.commit_all(&change.path, "branch changes order totals");
    fs::remove_file(repo.checkout().join("openspec/specs/orders/spec.md"))
        .expect("the living spec is removed");
    repo.commit_all(repo.checkout(), "main deletes order totals");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    assert!(
        !repo.exists(&change.path, "openspec/specs/orders/spec.md"),
        "the deleted living spec is gone"
    );
}

/// Proves a living spec path that cannot be removed stops the sync.
///
/// Covers: rust-land/sync-stops
#[test]
fn sync_stops_when_a_living_spec_cannot_be_removed() {
    let repo = LandRepo::new("sync-stops-removal");
    let change = repo.add_fixture_change();
    repo.write(&change.path, "openspec/specs/gone/spec.md/x", "x\n");
    repo.commit_all(&change.path, "branch adds a living spec directory");
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);

    let error = repo.run("1").expect_err("the land stops");
    assert!(error.to_string().starts_with("land failed: "), "{error}");
}
