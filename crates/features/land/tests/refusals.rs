//! Proves the refusals a land makes before it reports a landed change or writes.

mod support;

use std::fs;

use support::{ChangeTree, FIXTURE_FOLDER, LandRepo};

/// The empty contents most row files hold.
const EMPTY: &[u8] = b"";

/// A sealed approval.
fn approved() -> String {
    format!("sha256:{}\n", "0".repeat(64))
}

/// One archived event line at `time`.
fn archived_event(time: &str) -> String {
    format!("{{\"type\":\"archived\",\"timestamp\":\"{time}\",\"data\":{{}}}}\n")
}

/// A path inside one change's archived folder.
fn archive_path(change: &ChangeTree, relative: &str) -> String {
    format!("openspec/changes/archive/{}/{relative}", change.folder)
}

/// Writes one file into a change's archived folder.
fn write_archive(repo: &LandRepo, change: &ChangeTree, relative: &str, contents: impl AsRef<[u8]>) {
    repo.write(&change.path, &archive_path(change, relative), contents);
}

/// Commits every row file a change's archived folder gained.
fn commit_archive(repo: &LandRepo, change: &ChangeTree) {
    repo.commit_all(&change.path, "archive row files");
}

/// Leaves `notes.txt` untracked in a change's worktree.
fn untrack_notes(repo: &LandRepo, change: &ChangeTree) {
    repo.git(&change.path, &["rm", "--cached", "notes.txt"]);
    repo.git(
        &change.path,
        &["commit", "-q", "-m", "drop notes from the index"],
    );
}

/// Adds a commit to `main` that makes the fixture change look landed.
fn land_on_main(repo: &LandRepo) {
    let path = format!("openspec/changes/archive/{FIXTURE_FOLDER}/proposal.md");
    repo.write(repo.checkout(), &path, "---\ntitle: A\n---\n");
    repo.commit(repo.checkout(), "land the fixture change", &[&path]);
}

/// Asserts that `land` refused with `expected` and left `main` alone.
fn assert_refused(repo: &LandRepo, name: &str, expected: &str) {
    let before = repo.head(repo.checkout());
    let error = repo.run("1").expect_err(name);
    assert_eq!(
        error.to_string(),
        format!("land failed: {expected}"),
        "{name}"
    );
    assert_eq!(repo.head(repo.checkout()), before, "{name}: main unchanged");
}

/// Asserts that `land` landed the fixture change.
fn assert_landed(repo: &LandRepo, name: &str) {
    let output = repo
        .run("1")
        .unwrap_or_else(|error| panic!("{name}: {error}"));
    assert!(
        output.text.starts_with("Landed 001-alpha-orders as "),
        "{name}: {}",
        output.text
    );
}

/// Proves every row of "Refusals before the land".
///
/// Covers: rust-land/refusals-before-the-land
#[test]
fn refusals_before_the_land() {
    let stacked = LandRepo::new("refuse-stacked");
    let change = stacked.add_fixture_change();
    write_archive(
        &stacked,
        &change,
        ".run/stacked-on",
        "000-base sha256:x\n000-more sha256:y\n",
    );
    commit_archive(&stacked, &change);
    assert_refused(
        &stacked,
        "stacked change",
        "001-alpha-orders is stacked on 000-base, 000-more; Rust land does not land stacked changes yet",
    );

    let branch = LandRepo::new("refuse-branch");
    branch.add_fixture_change();
    branch.git(branch.checkout(), &["checkout", "-q", "-b", "feature"]);
    assert_refused(
        &branch,
        "checkout on feature",
        "osq land runs on main; the checkout is on feature",
    );

    let detached = LandRepo::new("refuse-detached");
    detached.add_fixture_change();
    detached.git(detached.checkout(), &["checkout", "-q", "--detach", "main"]);
    assert_refused(
        &detached,
        "checkout on a detached HEAD",
        "osq land runs on main; the checkout is on a detached HEAD",
    );

    let unclean = LandRepo::new("refuse-unclean");
    let change = unclean.add_fixture_change();
    untrack_notes(&unclean, &change);
    let expected = format!(
        "{} has uncommitted changes: notes.txt; commit or discard them first",
        change.path.display()
    );
    assert_refused(&unclean, "unclean worktree", &expected);

    let earlier = LandRepo::new("refuse-earlier");
    earlier.add_fixture_change();
    let approved = approved();
    let event = archived_event("2026-10-20T12:00:00.000Z");
    let files: [(&str, &[u8]); 4] = [
        ("specs/orders/spec.md", EMPTY),
        ("specs/billing/spec.md", EMPTY),
        (".run/approved", approved.as_bytes()),
        (".run/events/change.jsonl", event.as_bytes()),
    ];
    earlier.add_change_with("002-beta-orders", &files);
    assert_refused(
        &earlier,
        "earlier change shares a capability",
        "002-beta-orders archived before 001-alpha-orders and also writes orders; land it first",
    );
}

/// Proves every row of "Refusals for a landed change".
///
/// Covers: rust-land/refusals-for-a-landed-change
#[test]
fn refusals_for_a_landed_change() {
    let branch = LandRepo::new("landed-branch");
    branch.add_fixture_change();
    land_on_main(&branch);
    branch.git(branch.checkout(), &["checkout", "-q", "-b", "feature"]);
    assert_refused(
        &branch,
        "landed checkout on feature",
        "osq land runs on main; the checkout is on feature",
    );

    let unclean = LandRepo::new("landed-unclean");
    let change = unclean.add_fixture_change();
    land_on_main(&unclean);
    untrack_notes(&unclean, &change);
    let expected = format!(
        "{} has uncommitted changes: notes.txt; commit or discard them first",
        change.path.display()
    );
    assert_refused(&unclean, "landed unclean worktree", &expected);

    let stacked = LandRepo::new("landed-stacked");
    let change = stacked.add_fixture_change();
    write_archive(&stacked, &change, ".run/stacked-on", "000-base sha256:x\n");
    commit_archive(&stacked, &change);
    land_on_main(&stacked);
    let before = stacked.head(stacked.checkout());
    let output = stacked
        .run("1")
        .expect("a landed stacked change reports the landed output");
    assert_eq!(
        output.text, "001-alpha-orders has already landed; nothing to clean up\n",
        "landed stacked change output"
    );
    assert_eq!(
        stacked.head(stacked.checkout()),
        before,
        "landed stacked change: main gains no commit"
    );
}

/// One other worktree change of "Earlier changes that do not refuse".
enum Other {
    /// A later change writing only another capability.
    BillingLater,
    /// A later change writing the same capability.
    OrdersLater,
    /// A change with the same capability and no archived event.
    NoEvent,
    /// An earlier change with no archived approval.
    NoApproval,
    /// An earlier change the default branch already holds.
    Landed,
    /// An earlier change stacked on this one.
    StackedOnThis,
    /// An earlier change stacked through another change.
    StackedChain,
    /// An earlier change when this change has no archived event.
    NoCurrentEvent,
    /// An earlier change with the same archived time.
    SameTime,
    /// An earlier change writing the fixture's capability.
    OrdersEarlier,
}

/// Adds one archived worktree change with the row's archived files.
fn add_archived_change(
    repo: &LandRepo,
    folder: &str,
    specs: &[&str],
    event: Option<&str>,
    sealed: bool,
    stacked_on: Option<&str>,
) {
    let change = repo.add_worktree(folder);
    repo.write(&change.path, "src/one.txt", "two\n");
    let archive = change.path.join("openspec/changes/archive").join(folder);
    for spec in specs {
        repo.write(&archive, &format!("specs/{spec}/spec.md"), EMPTY);
    }
    if sealed {
        repo.write(&archive, ".run/approved", approved());
    }
    if let Some(time) = event {
        repo.write(&archive, ".run/events/change.jsonl", archived_event(time));
    }
    if let Some(base) = stacked_on {
        repo.write(&archive, ".run/stacked-on", base);
    }
    repo.commit_all(&change.path, &format!("work on {folder}"));
}

/// Lands `002-beta-orders` on `main` and merges that commit into the fixture branch.
fn land_beta_on_main(repo: &LandRepo, change: &ChangeTree) {
    let path = "openspec/changes/archive/002-beta-orders/proposal.md";
    repo.write(repo.checkout(), path, "---\ntitle: B\n---\n");
    repo.commit(repo.checkout(), "land 002-beta-orders", &[path]);
    repo.git(&change.path, &["merge", "-q", "--no-edit", "main"]);
}

/// Adds the fixture change and the row's other changes to one repository.
fn add_other(repo: &LandRepo, change: &ChangeTree, other: &Other) {
    let later = "2026-10-20T14:00:00.000Z";
    let earlier = "2026-10-20T12:00:00.000Z";
    let beta = "002-beta-orders";
    match other {
        Other::BillingLater => {
            add_archived_change(repo, beta, &["billing"], Some(later), true, None);
        }
        Other::OrdersLater => {
            add_archived_change(repo, beta, &["orders"], Some(later), true, None);
        }
        Other::NoEvent => {
            add_archived_change(repo, beta, &["orders"], None, true, None);
        }
        Other::NoApproval => {
            add_archived_change(repo, beta, &["orders"], Some(earlier), false, None);
        }
        Other::Landed => {
            add_archived_change(repo, beta, &["orders"], Some(earlier), true, None);
            land_beta_on_main(repo, change);
        }
        Other::StackedOnThis => {
            add_archived_change(
                repo,
                beta,
                &["orders"],
                Some(earlier),
                true,
                Some("001-alpha-orders sha256:x\n"),
            );
        }
        Other::StackedChain => {
            add_archived_change(
                repo,
                beta,
                &["billing"],
                Some(later),
                true,
                Some("001-alpha-orders sha256:x\n"),
            );
            add_archived_change(
                repo,
                "003-gamma-orders",
                &["orders"],
                Some(earlier),
                true,
                Some("002-beta-orders sha256:y\n"),
            );
        }
        Other::NoCurrentEvent => {
            add_archived_change(repo, beta, &["orders"], Some(earlier), true, None);
            fs::remove_file(
                change
                    .path
                    .join(archive_path(change, ".run/events/change.jsonl")),
            )
            .expect("the current change's event log is removed");
            repo.commit_all(&change.path, "drop the archived event");
        }
        Other::SameTime => {
            add_archived_change(
                repo,
                beta,
                &["orders"],
                Some("2026-10-20T13:00:00.000Z"),
                true,
                None,
            );
        }
        Other::OrdersEarlier => {
            add_archived_change(repo, beta, &["orders"], Some(earlier), true, None);
        }
    }
}

/// Proves every row of "Earlier changes that do not refuse".
///
/// Covers: rust-land/earlier-changes-that-do-not-refuse
#[test]
fn earlier_changes_that_do_not_refuse() {
    let rows = [
        (
            "later change writes another capability",
            Other::BillingLater,
        ),
        (
            "later change writes the same capability",
            Other::OrdersLater,
        ),
        ("other change has no archived event", Other::NoEvent),
        ("other change has no approval", Other::NoApproval),
        ("other change already landed", Other::Landed),
        ("other change stacked on this one", Other::StackedOnThis),
        ("other change stacked through another", Other::StackedChain),
        ("this change has no archived event", Other::NoCurrentEvent),
        ("other change archived at the same time", Other::SameTime),
    ];
    for (index, (name, other)) in rows.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("earlier-ok-{index}"));
        let change = repo.add_fixture_change();
        add_other(&repo, &change, &other);
        assert_landed(&repo, name);
    }
}

/// Proves a change with no capabilities shares none and never refuses.
///
/// Covers: rust-land/earlier-changes-that-do-not-refuse
#[test]
fn change_without_capabilities_does_not_refuse() {
    let repo = LandRepo::new("earlier-no-capabilities");
    let change = repo.add_fixture_change();
    fs::remove_file(
        change
            .path
            .join(archive_path(&change, "specs/orders/spec.md")),
    )
    .expect("the fixture capability spec is removed");
    fs::remove_dir(change.path.join(archive_path(&change, "specs/orders")))
        .expect("the empty capability folder is removed");
    repo.commit_all(&change.path, "drop the capability spec");
    add_other(&repo, &change, &Other::OrdersEarlier);
    assert_landed(&repo, "change without capabilities");
}
