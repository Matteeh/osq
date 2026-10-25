//! Proves `sync` and `message` refuse a query core does not read as a change id
//! with core's message, and keep the not-found text for a well-formed query.

mod support;

use osq_core::FeatureError;
use support::{FIXTURE_FOLDER, LandRepo, run_args};

/// The refusal core gives for the query `1]`.
const REFUSAL: &str = "\"1]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name";

/// Proves every row of "Sync and message refuse a query that is not a change id".
///
/// Covers: rust-land/sync-and-message-refuse-a-query-that-is-not-a-change-id
#[test]
fn sync_and_message_refuse_a_query_that_is_not_a_change_id() {
    let rows = [
        ("sync", "1]", REFUSAL),
        (
            "sync",
            "001-alpha",
            "No change \"001-alpha\" runs in an osq worktree",
        ),
        ("message", "1]", REFUSAL),
        (
            "message",
            "001-alpha",
            "No archived change \"001-alpha\" in an osq worktree",
        ),
    ];
    for (index, (command, query, message)) in rows.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("change-id-{index}"));
        let change = repo.add_fixture_change_committed();
        let branch = format!("osq/{FIXTURE_FOLDER}");
        let main = repo.head(repo.checkout());
        let tip = repo.branch_head(&branch);
        let status = repo.git(
            &change.path,
            &["status", "--porcelain", "--untracked-files=all"],
        );
        let error = run_args(repo.checkout(), command, &[query])
            .expect_err(&format!("{command} {query} is refused"));
        match &error {
            FeatureError::Failed {
                command: actual,
                message: actual_message,
                ..
            } => {
                assert_eq!(actual, command, "{command} {query}: command");
                assert_eq!(actual_message, message, "{command} {query}: message");
            }
            other => panic!("{command} {query}: expected a failed error, got {other:?}"),
        }
        assert_eq!(
            repo.head(repo.checkout()),
            main,
            "{command} {query}: main unchanged"
        );
        assert_eq!(
            repo.branch_head(&branch),
            tip,
            "{command} {query}: branch unchanged"
        );
        assert_eq!(
            repo.git(
                &change.path,
                &["status", "--porcelain", "--untracked-files=all"]
            ),
            status,
            "{command} {query}: status unchanged"
        );
    }
}
