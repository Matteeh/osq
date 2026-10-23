//! Proves the message a land commit carries.

mod support;

use std::fs;

use support::{LandRepo, fixture};

/// The commit a land output names.
fn landed_commit(output: &str) -> String {
    output
        .lines()
        .next()
        .and_then(|line| line.rsplit_once(" as "))
        .map(|(_, commit)| commit.to_owned())
        .expect("the output names the land commit")
}

/// Proves "Golden land message" against TypeScript's written message.
///
/// Covers: rust-land/golden-land-message
#[test]
fn golden_land_message() {
    let repo = LandRepo::new("golden_message");
    repo.add_fixture_change();
    let head = repo.branch_head("osq/001-alpha-orders");
    let output = repo.run("1").expect("the land succeeds");
    let commit = landed_commit(&output.text);
    let expected = fs::read_to_string(fixture("land-message.txt"))
        .expect("the golden message reads")
        .replace("<head>", &head);
    assert_eq!(repo.message(&commit), expected);
}

/// Proves "Message for a bare folder".
///
/// Covers: rust-land/message-for-a-bare-folder
#[test]
fn message_for_a_bare_folder() {
    let repo = LandRepo::new("bare_message");
    repo.add_change_with(
        "001",
        &[("proposal.md", &b"---\ntitle: A\n---\n## Verify\n\nx\n"[..])],
    );
    let head = repo.branch_head("osq/001");
    let output = repo.run("1").expect("the land succeeds");
    let commit = landed_commit(&output.text);
    assert_eq!(
        repo.message(&commit),
        format!("osq: 001 \n\n\n\n\nOsq-Change: 001\nOsq-Head: {head}\n")
    );
}
