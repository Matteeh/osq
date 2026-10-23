//! Proves worktree rejections against TypeScript's goldens.

mod support;

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::FeatureError;

use support::{copy_tree, fixture, run_args, write};

/// The author every scratch repository's `osq.toml` gives.
const AUTHOR: &str = "osq <osq@example.com>";

/// The reason every golden case rejects with.
const REASON: &str = "why";

/// Where a row's change lives.
enum Place {
    /// The change sits in the repository's checkout.
    Root,
    /// The change sits in an osq worktree.
    Worktree,
}

/// What a row adds before its rejection runs.
enum Extra {
    /// Nothing beyond the fixture.
    None,
    /// A file outside the change folder.
    OtherChanges,
    /// A pre-commit hook that refuses the commit.
    Hook,
    /// A locked worktree.
    Locked,
}

/// One row of "Worktree rejections equal TypeScript's".
struct Case {
    /// The row's name, which names its golden and scratch folder.
    name: &'static str,
    /// The change folder the fixture supplies.
    folder: &'static str,
    /// The change id the query names.
    id: &'static str,
    /// Where the row's change lives.
    place: Place,
    /// What the row adds before its rejection runs.
    extra: Extra,
    /// The phrase a kept line must hold, or none when the why is compared.
    phrase: Option<&'static str>,
}

/// Every row of "Worktree rejections equal TypeScript's", in table order.
const CASES: &[Case] = &[
    Case {
        name: "removed-001",
        folder: "001-alpha",
        id: "1",
        place: Place::Worktree,
        extra: Extra::None,
        phrase: None,
    },
    Case {
        name: "other-changes-001",
        folder: "001-alpha",
        id: "1",
        place: Place::Worktree,
        extra: Extra::OtherChanges,
        phrase: None,
    },
    Case {
        name: "hook-fails-001",
        folder: "001-alpha",
        id: "1",
        place: Place::Worktree,
        extra: Extra::Hook,
        phrase: Some("refused by hook"),
    },
    Case {
        name: "locked-001",
        folder: "001-alpha",
        id: "1",
        place: Place::Worktree,
        extra: Extra::Locked,
        phrase: Some("cannot remove a locked working tree"),
    },
    Case {
        name: "healthy-002",
        folder: "002-healthy",
        id: "2",
        place: Place::Worktree,
        extra: Extra::None,
        phrase: None,
    },
    Case {
        name: "root-003",
        folder: "003-root",
        id: "3",
        place: Place::Root,
        extra: Extra::None,
        phrase: None,
    },
];

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`, named after the case.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reject_worktree")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    fs::canonicalize(root).expect("the scratch root canonicalizes")
}

/// Runs git in `cwd`, giving its stdout.
fn git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("git writes text")
}

/// The scratch repository, worktree and branch one case rejects in.
struct Repo {
    /// The scratch root that holds the repository and its worktrees.
    scratch: PathBuf,
    /// The repository under the scratch root.
    path: PathBuf,
    /// The tree that holds the change: the repository or a worktree.
    tree: PathBuf,
    /// The branch the case's tip is read from.
    branch: String,
}

/// Builds the scratch repository the golden script describes for `case`.
fn repository(case: &Case) -> Repo {
    let scratch = scratch(case.name);
    let repo = scratch.join("repo");
    fs::create_dir_all(&repo).expect("the repository folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    git(&repo, &["config", "commit.gpgsign", "false"]);
    fs::write(repo.join("README.md"), "fixture\n").expect("the README is written");
    fs::write(
        repo.join("osq.toml"),
        format!(
            "[vcs]\nenabled = true\nauthor = \"{AUTHOR}\"\nworktreeRoot = \"{}\"\n",
            scratch.join("worktrees").display()
        ),
    )
    .expect("osq.toml is written");
    let from = fixture(&format!("reject-worktree/{}", case.folder));
    if matches!(case.place, Place::Root) {
        copy_tree(&from, &repo.join("openspec/changes").join(case.folder));
    }
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    if matches!(case.place, Place::Root) {
        return Repo {
            scratch,
            tree: repo.clone(),
            path: repo,
            branch: "main".to_owned(),
        };
    }
    let branch = format!("osq/{}", case.folder);
    let tree = scratch.join("trees").join(case.folder);
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            &branch,
            &tree.to_string_lossy(),
            "main",
        ],
    );
    copy_tree(&from, &tree.join("openspec/changes").join(case.folder));
    git(&tree, &["add", "-A"]);
    git(
        &tree,
        &[
            "commit",
            "-q",
            "-m",
            &format!("osq: {:0>3} approved", case.id),
        ],
    );
    Repo {
        scratch,
        path: repo,
        tree,
        branch,
    }
}

/// Adds the row's other changes, hook or lock before the rejection runs.
fn arrange(case: &Case, repo: &Repo) {
    match case.extra {
        Extra::None => {}
        Extra::OtherChanges => {
            fs::write(repo.tree.join("notes.txt"), "x\n").expect("the note is written");
        }
        Extra::Hook => {
            let hook = repo.path.join(".git/hooks/pre-commit");
            fs::write(&hook, "#!/bin/sh\necho refused by hook >&2\nexit 1\n")
                .expect("the hook is written");
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o755))
                .expect("the hook is executable");
        }
        Extra::Locked => {
            git(
                &repo.path,
                &["worktree", "lock", &repo.tree.to_string_lossy()],
            );
        }
    }
}

/// The golden text for `case`.
fn golden(case: &Case) -> String {
    fs::read_to_string(fixture("reject-worktree-golden").join(format!("{}.txt", case.name)))
        .expect("the golden reads")
}

/// The text the golden script writes for one rejection, with `<scratch>` put back.
fn render(repo: &Repo, result: &Result<String, FeatureError>) -> String {
    let mut text = String::new();
    match result {
        Ok(output) => {
            text.push_str("out:\n");
            text.push_str(output);
        }
        Err(error) => {
            let message = error.to_string();
            let message = message.strip_prefix("reject failed: ").unwrap_or(&message);
            text.push_str("error:\n");
            text.push_str(message);
            text.push('\n');
        }
    }
    text.push_str("branches:\n");
    text.push_str(&git(
        &repo.path,
        &["branch", "--list", "osq/*", "--format=%(refname:short)"],
    ));
    text.push_str("worktrees:\n");
    for line in git(&repo.path, &["worktree", "list", "--porcelain"]).lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            text.push_str(path);
            text.push('\n');
        }
    }
    text.push_str("tip:\n");
    text.push_str(&git(
        &repo.path,
        &["log", "-1", "--format=%B", &repo.branch],
    ));
    text.push_str("commit:\n");
    text.push_str(&git(
        &repo.path,
        &[
            "show",
            "--no-renames",
            "--name-status",
            "--format=",
            &repo.branch,
        ],
    ));
    let status_in = if repo.tree.exists() {
        repo.tree.as_path()
    } else {
        repo.path.as_path()
    };
    text.push_str("status:\n");
    text.push_str(&git(
        status_in,
        &["status", "--porcelain", "--untracked-files=all"],
    ));
    text.replace(&repo.scratch.display().to_string(), "<scratch>")
}

/// `text` with a kept line's reason replaced, so a git message is not compared.
fn without_kept_why(text: &str) -> String {
    let Some(start) = text.find("  Worktree kept: ") else {
        return text.to_owned();
    };
    let Some(offset) = text[start..].find("\n  Branch kept: ") else {
        return text.to_owned();
    };
    format!(
        "{}  Worktree kept: <why>{}",
        &text[..start],
        &text[start + offset..]
    )
}

/// Proves every row of "Worktree rejections equal TypeScript's".
///
/// Covers: rust-approve/worktree-rejections-equal-typescript-s
#[test]
fn worktree_rejections_equal_typescript() {
    for case in CASES {
        let repo = repository(case);
        arrange(case, &repo);
        let result = run_args(&repo.path, "reject", &[case.id, "--reason", REASON])
            .map(|output| output.text);
        let rendered = render(&repo, &result);
        let expected = golden(case);
        if let Some(phrase) = case.phrase {
            let kept = format!("  Worktree kept: <scratch>/trees/{} (", case.folder);
            assert!(
                rendered.contains(&kept),
                "{}: the kept line starts with {kept:?}: {rendered}",
                case.name
            );
            assert!(
                rendered.contains(phrase),
                "{}: the kept line holds {phrase:?}: {rendered}",
                case.name
            );
            assert_eq!(
                without_kept_why(&rendered),
                without_kept_why(&expected),
                "{}: golden text outside the kept reason",
                case.name
            );
        } else {
            assert_eq!(rendered, expected, "{}: golden text", case.name);
        }
    }
}

/// Proves a config that does not load fails before the change moves.
///
/// Covers: rust-approve/reject-config-that-does-not-load
#[test]
fn reject_config_that_does_not_load() {
    let root = scratch("config-that-does-not-load");
    write(&root, "osq.toml", "[vcs]\nenabled = true\n");
    write(
        &root,
        "openspec/changes/001-a/proposal.md",
        "---\ntitle: A\n---\n",
    );
    write(
        &root,
        "openspec/changes/001-a/tasks/1.md",
        "---\ntitle: A\n---\n",
    );
    let error =
        run_args(&root, "reject", &["1", "--reason", "why"]).expect_err("the config is refused");
    assert_eq!(
        error.to_string(),
        "reject failed: vcs.author is required when vcs.enabled is true",
        "the config error"
    );
    assert!(
        root.join("openspec/changes/001-a").is_dir(),
        "the change is still in place"
    );
    assert!(
        !root.join("openspec/changes/001-a/.run").exists(),
        "no .run folder is written"
    );
}

/// Proves a rejected folder never matches a lookup with git on.
///
/// Covers: rust-approve/reject-with-no-match
#[test]
fn rejected_folder_never_matches() {
    let root = scratch("rejected-folder-never-matches");
    git(&root, &["init", "-q", "-b", "main"]);
    git(&root, &["config", "user.name", "osq"]);
    git(&root, &["config", "user.email", "osq@example.com"]);
    git(&root, &["config", "commit.gpgsign", "false"]);
    fs::write(
        root.join("osq.toml"),
        format!("[vcs]\nenabled = true\nauthor = \"{AUTHOR}\"\n"),
    )
    .expect("osq.toml is written");
    fs::create_dir_all(root.join("openspec/changes/rejected/001-a"))
        .expect("the rejected folder is created");
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-q", "-m", "init"]);
    let error = run_args(&root, "reject", &["1", "--reason", "why"])
        .expect_err("a rejected folder never matches");
    assert_eq!(
        error.to_string(),
        format!(
            "reject failed: Spec \"1\" not found in {}",
            root.join("openspec/changes").display()
        ),
        "the lookup leaves rejected folders out"
    );
}
