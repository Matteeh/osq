//! Proves `sync` against TypeScript's goldens and the refusals Rust adds.

mod support;

use std::fs;

use osq_core::FeatureError;
use serde_json::Value;
use support::{ChangeTree, FIXTURE_FOLDER, LandRepo, fixture, orders_spec, run_args, scratch};

/// The sync goldens' path.
const SYNC_GOLDEN: &str = "sync-message-golden/sync.json";

/// The archived folder of the fixture change.
fn archived() -> String {
    format!("openspec/changes/archive/{FIXTURE_FOLDER}")
}

/// The golden rows parsed from TypeScript's `sync.json`.
fn rows() -> Vec<Value> {
    let text = fs::read_to_string(fixture(SYNC_GOLDEN)).expect("the sync goldens read");
    serde_json::from_str(&text).expect("the sync goldens are JSON")
}

/// Builds the land repository a golden row names.
fn build(repo: &LandRepo, name: &str) -> ChangeTree {
    match name {
        "clean-001" => {
            let change = repo.add_alpha_change(FIXTURE_FOLDER);
            repo.main_file("other.txt", "other\n", "main adds other");
            change
        }
        "current-001" | "missing-2" => repo.add_fixture_change_committed(),
        "spec-conflict-001" => {
            let change = repo.add_alpha_change(FIXTURE_FOLDER);
            repo.main_file(
                "openspec/specs/orders/spec.md",
                orders_spec("Beta"),
                "main adds beta",
            );
            change
        }
        "code-conflict-001" => {
            let change = repo.add_fixture_change_committed();
            repo.main_file("src/one.txt", "main\n", "main edits one");
            change
        }
        "vcs-off-001" => {
            let change = repo.add_fixture_change_committed();
            repo.disable_vcs();
            change
        }
        "dirty-001" => {
            let change = repo.add_fixture_change_committed();
            repo.write(&change.path, "notes.txt", "dirty\n");
            change
        }
        "run-dirt-001" => {
            let change = repo.add_alpha_change(FIXTURE_FOLDER);
            repo.write(
                &change.path,
                &format!("{}/.run/extra", archived()),
                "extra\n",
            );
            repo.main_file("other.txt", "other\n", "main adds other");
            change
        }
        "renamed-001" => {
            let change = repo.add_fixture_change_committed();
            repo.git(&change.path, &["mv", "notes.txt", "moved.txt"]);
            change
        }
        "tasks-dirt-001" => {
            let change = repo.add_alpha_change(FIXTURE_FOLDER);
            repo.write(
                &change.path,
                &format!("{}/tasks.md", archived()),
                "# Tasks\n",
            );
            repo.main_file("other.txt", "other\n", "main adds other");
            change
        }
        other => panic!("the sync golden names no repository for {other}"),
    }
}

/// Replaces the golden's worktree and head placeholders.
fn placeholders(text: &str, change: &ChangeTree, head: &str) -> String {
    text.replace("<wt>", &change.path.display().to_string())
        .replace("<head>", head)
}

/// Proves every row of "Sync equals TypeScript's".
///
/// Covers: rust-land/sync-equals-typescript-s
#[test]
fn sync_equals_typescript() {
    for row in rows() {
        let name = row["name"].as_str().expect("a row has a name");
        let query = row["query"].as_str().expect("a row has a query");
        let repo = LandRepo::new(&format!("sync-{name}"));
        let change = build(&repo, name);
        let head = repo.branch_head(&format!("osq/{FIXTURE_FOLDER}"));
        let result = run_args(repo.checkout(), "sync", &[query]);
        let expected = |key: &str| {
            placeholders(
                row[key].as_str().unwrap_or_else(|| panic!("{name}: {key}")),
                &change,
                &head,
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
            &format!("{}/.run/regressed/change.md", archived()),
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
    }
}

/// Proves every row of "Sync refusals Rust adds".
///
/// Covers: rust-land/sync-refusals-rust-adds
#[test]
fn sync_refusals_rust_adds() {
    let stacked = "000-base sha256:x\n000-more sha256:y\n";
    let rows = [
        (
            "active",
            "001-alpha-orders has not archived; Rust sync does not sync an active change yet",
        ),
        (
            "stacked",
            "001-alpha-orders is stacked on 000-base, 000-more; Rust sync does not sync stacked changes yet",
        ),
    ];
    for (name, message) in rows {
        let repo = LandRepo::new(&format!("sync-refusal-{name}"));
        let change = if name == "active" {
            repo.add_change_files(
                FIXTURE_FOLDER,
                &[
                    (
                        "openspec/changes/001-alpha-orders/proposal.md",
                        b"---\ntitle: A\n---\n",
                    ),
                    (
                        "openspec/changes/001-alpha-orders/.run/approved",
                        b"sha256:aaaa\n",
                    ),
                ],
            )
        } else {
            let change = repo.add_fixture_change_committed();
            repo.write(
                &change.path,
                &format!("{}/.run/stacked-on", archived()),
                stacked,
            );
            repo.commit_all(&change.path, "record the stack");
            change
        };
        repo.main_file("other.txt", "other\n", "main adds other");
        let tip = repo.branch_head(&format!("osq/{FIXTURE_FOLDER}"));
        let status = repo.git(
            &change.path,
            &["status", "--porcelain", "--untracked-files=all"],
        );
        let error = run_args(repo.checkout(), "sync", &["1"]).expect_err(name);
        match &error {
            FeatureError::Failed {
                command,
                message: actual,
                ..
            } => {
                assert_eq!(command, "sync", "{name}: command");
                assert_eq!(actual, message, "{name}: message");
            }
            other => panic!("{name}: expected a failed error, got {other:?}"),
        }
        assert_eq!(
            repo.branch_head(&format!("osq/{FIXTURE_FOLDER}")),
            tip,
            "{name}: tip unchanged"
        );
        assert_eq!(
            repo.git(
                &change.path,
                &["status", "--porcelain", "--untracked-files=all"]
            ),
            status,
            "{name}: status unchanged"
        );
    }
}

/// Proves `sync` refuses a root without a git repository.
///
/// Covers: rust-land/sync-equals-typescript-s
#[test]
fn sync_needs_git_without_a_repository() {
    let root = scratch("sync-no-repository");
    fs::write(root.join(".git"), "gitdir: /nonexistent\n").expect("the broken marker writes");
    fs::write(
        root.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\n",
    )
    .expect("the config writes");
    let error = run_args(&root, "sync", &["1"]).expect_err("sync needs git");
    assert_eq!(
        error.to_string(),
        "sync failed: osq sync needs vcs.enabled and git"
    );
}
