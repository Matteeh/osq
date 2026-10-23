//! Proves `message` against TypeScript's goldens and a stacked change.

mod support;

use std::fs;

use osq_core::FeatureError;
use serde_json::Value;
use support::{FIXTURE_FOLDER, LandRepo, fixture, run_args, scratch};

/// The message goldens' path.
const MESSAGE_GOLDEN: &str = "sync-message-golden/message.json";

/// The archived folder of the fixture change.
fn archived() -> String {
    format!("openspec/changes/archive/{FIXTURE_FOLDER}")
}

/// The golden rows parsed from TypeScript's `message.json`.
fn rows() -> Vec<Value> {
    let text = fs::read_to_string(fixture(MESSAGE_GOLDEN)).expect("the message goldens read");
    serde_json::from_str(&text).expect("the message goldens are JSON")
}

/// What one built message repository holds: its change and its folder.
struct Built {
    /// The change's worktree.
    change: support::ChangeTree,
    /// The change's folder.
    folder: String,
}

/// Builds the land repository a golden row names.
fn build(repo: &LandRepo, name: &str) -> Built {
    match name {
        "fixture-001" | "missing-2" => Built {
            change: repo.add_fixture_change_committed(),
            folder: FIXTURE_FOLDER.to_owned(),
        },
        "bare-001" => Built {
            change: repo.add_change_with(
                "001",
                &[("proposal.md", b"---\ntitle: A\n---\n## Verify\n\nx\n")],
            ),
            folder: "001".to_owned(),
        },
        "vcs-off-001" => {
            let change = repo.add_fixture_change_committed();
            repo.disable_vcs();
            Built {
                change,
                folder: FIXTURE_FOLDER.to_owned(),
            }
        }
        "active-001" => Built {
            change: repo.add_change_files(
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
            ),
            folder: FIXTURE_FOLDER.to_owned(),
        },
        other => panic!("the message golden names no repository for {other}"),
    }
}

/// Proves every row of "Message equals TypeScript's".
///
/// Covers: rust-land/message-equals-typescript-s
#[test]
fn message_equals_typescript() {
    for row in rows() {
        let name = row["name"].as_str().expect("a row has a name");
        let query = row["query"].as_str().expect("a row has a query");
        let repo = LandRepo::new(&format!("message-{name}"));
        let built = build(&repo, name);
        let branch = format!("osq/{}", built.folder);
        let head = repo.branch_head(&branch);
        let status = repo.git(
            &built.change.path,
            &["status", "--porcelain", "--untracked-files=all"],
        );
        let result = run_args(repo.checkout(), "message", &[query]);
        let expected = |key: &str| {
            row[key]
                .as_str()
                .unwrap_or_else(|| panic!("{name}: {key}"))
                .replace("<wt>", &built.change.path.display().to_string())
                .replace("<head>", &head)
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
                    assert_eq!(command, "message", "{name}: command");
                    assert_eq!(message, &expected("error"), "{name}: error");
                }
                other => panic!("{name}: expected a failed error, got {other:?}"),
            }
        }
        assert_eq!(repo.branch_head(&branch), head, "{name}: branch unchanged");
        assert_eq!(
            repo.git(
                &built.change.path,
                &["status", "--porcelain", "--untracked-files=all"]
            ),
            status,
            "{name}: status unchanged"
        );
    }
}

/// Proves "Message for a stacked change".
///
/// Covers: rust-land/message-for-a-stacked-change
#[test]
fn message_for_a_stacked_change() {
    let repo = LandRepo::new("message-stacked");
    let change = repo.add_fixture_change_committed();
    repo.write(
        &change.path,
        &format!("{}/.run/stacked-on", archived()),
        "000-base sha256:x\n",
    );
    repo.commit_all(&change.path, "record the stack");
    let head = repo.branch_head(&format!("osq/{FIXTURE_FOLDER}"));
    let error = run_args(repo.checkout(), "message", &["1"]).expect_err("message refuses a stack");
    match &error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "message");
            assert_eq!(
                message,
                "001-alpha-orders is stacked on 000-base; Rust message does not build stacked changes' messages yet"
            );
        }
        other => panic!("expected a failed error, got {other:?}"),
    }
    assert_eq!(
        repo.branch_head(&format!("osq/{FIXTURE_FOLDER}")),
        head,
        "the branch is unchanged"
    );
}

/// Proves `message` refuses a root without a git repository.
///
/// Covers: rust-land/message-equals-typescript-s
#[test]
fn message_needs_git_without_a_repository() {
    let root = scratch("message-no-repository");
    fs::write(root.join(".git"), "gitdir: /nonexistent\n").expect("the broken marker writes");
    fs::write(
        root.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\n",
    )
    .expect("the config writes");
    let error = run_args(&root, "message", &["1"]).expect_err("message needs git");
    assert_eq!(
        error.to_string(),
        "message failed: osq message needs vcs.enabled and git"
    );
}
