//! Proves the change `land` picks for a query and the already-landed outputs.

mod support;

use std::fs;
use std::path::PathBuf;

use support::{FIXTURE_FOLDER, LandRepo, copy_tree, fixture};

/// Adds the fixture change in a worktree at its configured cleanup path.
fn configured_change(repo: &LandRepo) -> PathBuf {
    repo.write(
        repo.checkout(),
        "osq.toml",
        format!(
            "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\nworktreeRoot = \"{}\"\n",
            repo.scratch().join("wt").display()
        ),
    );
    let path = repo
        .scratch()
        .join("wt")
        .join("checkout")
        .join(FIXTURE_FOLDER);
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
    path
}

/// What one lookup row expects.
enum Expected {
    /// A land whose output begins with this line.
    Landed,
    /// A refusal with this message.
    Failed(&'static str),
}

/// Every row of "Change for a query".
const LOOKUP_ROWS: [(&str, &str, Expected); 12] = [
    ("fixture by 1", "1", Expected::Landed),
    ("fixture by 001", "001", Expected::Landed),
    ("fixture by padded spaces", "  1  ", Expected::Landed),
    ("fixture by name", "001-alpha-orders", Expected::Landed),
    (
        "fixture by prefix",
        "001-alpha",
        Expected::Failed("No archived change \"001-alpha\" in an osq worktree"),
    ),
    (
        "fixture by longer name",
        "001-alpha-orders-x",
        Expected::Failed("No archived change \"001-alpha-orders-x\" in an osq worktree"),
    ),
    (
        "fixture by 1x",
        "1x",
        Expected::Failed("No archived change \"1x\" in an osq worktree"),
    ),
    (
        "fixture by 1]",
        "1]",
        Expected::Failed(
            "\"1]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name",
        ),
    ),
    (
        "no change 2",
        "2",
        Expected::Failed("No archived change \"2\" in an osq worktree"),
    ),
    (
        "no change alpha",
        "alpha",
        Expected::Failed("No archived change \"alpha\" in an osq worktree"),
    ),
    (
        "active only",
        "1",
        Expected::Failed("001-alpha-orders has not archived on osq/001-alpha-orders"),
    ),
    (
        "renamed branch",
        "1",
        Expected::Failed("No archived change \"1\" in an osq worktree"),
    ),
];

/// Proves every row of "Change for a query".
///
/// Covers: rust-land/change-for-a-query
#[test]
fn change_for_a_query() {
    for (index, (name, query, expected)) in LOOKUP_ROWS.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("lookup-{index}"));
        match name {
            "active only" => {
                repo.add_unarchived_change("001-alpha-orders");
            }
            "renamed branch" => {
                let change = repo.add_fixture_change();
                repo.rename_branch(&change, "work/001-alpha-orders");
            }
            _ => {
                repo.add_fixture_change();
            }
        }
        let before = repo.head(repo.checkout());
        match expected {
            Expected::Landed => {
                let output = repo
                    .run(query)
                    .unwrap_or_else(|error| panic!("{name}: {error}"));
                assert!(
                    output.text.starts_with("Landed 001-alpha-orders as "),
                    "{name}: {}",
                    output.text
                );
            }
            Expected::Failed(message) => {
                let error = repo.run(query).expect_err(name);
                assert_eq!(
                    error.to_string(),
                    format!("land failed: {message}"),
                    "{name}"
                );
                assert_eq!(repo.head(repo.checkout()), before, "{name}: main unchanged");
            }
        }
    }
}

/// Proves the checkout fallback leaves out an archived folder the query misses.
///
/// Covers: rust-land/change-for-a-query
#[test]
fn checkout_fallback_skips_unmatched_archives() {
    let repo = LandRepo::new("lookup_skips_unmatched_archive");
    repo.add_unarchived_change("001-alpha-orders");
    repo.write(
        repo.checkout(),
        "openspec/changes/archive/002-beta/proposal.md",
        "---\ntitle: B\n---\n",
    );
    repo.commit(
        repo.checkout(),
        "land another change",
        &["openspec/changes/archive/002-beta/proposal.md"],
    );
    let error = repo
        .run("1")
        .expect_err("the active change has not archived");
    assert_eq!(
        error.to_string(),
        "land failed: 001-alpha-orders has not archived on osq/001-alpha-orders"
    );
}

/// Proves both rows of "Already landed".
///
/// Covers: rust-land/already-landed
#[test]
fn already_landed() {
    let rows = [
        (
            "worktree remains",
            false,
            "001-alpha-orders has already landed\nRemoved worktree {path}\n",
        ),
        (
            "worktree removed",
            true,
            "001-alpha-orders has already landed; nothing to clean up\n",
        ),
    ];
    for (index, (name, remove, template)) in rows.into_iter().enumerate() {
        let repo = LandRepo::new(&format!("landed-{index}"));
        let path = configured_change(&repo);
        repo.write(
            repo.checkout(),
            "openspec/changes/archive/001-alpha-orders/proposal.md",
            "---\ntitle: A\n---\n",
        );
        repo.commit(
            repo.checkout(),
            "land the fixture change",
            &["openspec/changes/archive/001-alpha-orders/proposal.md"],
        );
        if remove {
            repo.git(
                repo.checkout(),
                &[
                    "worktree",
                    "remove",
                    "--force",
                    path.to_str().expect("the worktree path is text"),
                ],
            );
        }
        let before = repo.head(repo.checkout());
        let output = repo
            .run("1")
            .unwrap_or_else(|error| panic!("{name}: {error}"));
        let expected = template.replace("{path}", &path.display().to_string());
        assert_eq!(output.text, expected, "{name}");
        assert_eq!(
            repo.head(repo.checkout()),
            before,
            "{name}: main gains no commit"
        );
    }
}
