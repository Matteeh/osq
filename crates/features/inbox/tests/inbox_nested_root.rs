//! Proves inbox refuses a project root below its repository's top level.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;

/// The `osq.toml` every nested root holds.
const CONFIG: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n";

/// The proposal every nested root's change holds.
const PROPOSAL: &str = "---\ntitle: Alpha\nverify: \"true\"\n---\n## Goal\n\nAlpha.\n";

/// The task file every nested root's change holds.
const TASK: &str = "---\ntitle: T\nverify: \"true\"\nscope:\n  - a.txt\n---\n- [ ] a\n";

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`, named `name`.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("inbox_nested_root")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    fs::canonicalize(root).expect("the scratch root canonicalizes")
}

/// Writes one file under `root`, creating its folders.
fn write(root: &Path, relative: &str, contents: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, contents).expect("the file is written");
}

/// Runs git in `cwd` without the machine's global or system config, giving stdout.
fn git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
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

/// Builds a fresh repository for `name` whose one commit holds the nested project.
fn build(name: &str) -> PathBuf {
    let outer = scratch(name);
    git(&outer, &["init", "-q", "-b", "main"]);
    git(&outer, &["config", "user.name", "Osq Tester"]);
    git(&outer, &["config", "user.email", "tester@example.com"]);
    write(&outer, "sub/osq.toml", CONFIG);
    write(&outer, "sub/openspec/specs/.keep", "");
    write(
        &outer,
        "sub/openspec/changes/001-alpha/proposal.md",
        PROPOSAL,
    );
    write(&outer, "sub/openspec/changes/001-alpha/tasks/1.md", TASK);
    git(&outer, &["add", "-A"]);
    git(&outer, &["commit", "-q", "-m", "fixture"]);
    outer
}

/// The repository's git state and its files outside `.git`.
fn snapshot(outer: &Path) -> Vec<String> {
    let mut files = Vec::new();
    collect_files(outer, outer, &mut files);
    files.sort();
    vec![
        format!(
            "status:\n{}",
            git(
                outer,
                &["status", "--porcelain=v1", "--untracked-files=all"]
            )
        ),
        format!("branches:\n{}", git(outer, &["branch", "--list"])),
        format!(
            "worktrees:\n{}",
            git(outer, &["worktree", "list", "--porcelain"])
        ),
        format!("files:\n{}", files.join("\n")),
    ]
}

/// Adds every file under `dir` to `files`, relative to `base`, leaving `.git` out.
fn collect_files(base: &Path, dir: &Path, files: &mut Vec<String>) {
    for entry in fs::read_dir(dir).expect("the folder is read").flatten() {
        let path = entry.path();
        let relative = path
            .strip_prefix(base)
            .expect("the entry sits under the base folder")
            .to_string_lossy()
            .replace('\\', "/");
        if relative == ".git" {
            continue;
        }
        if entry.file_type().expect("the entry type is read").is_dir() {
            collect_files(base, &path, files);
        } else {
            files.push(relative);
        }
    }
}

/// Proves the inbox row of "Every git command refuses a nested root".
///
/// Covers: rust-vcs/every-git-command-refuses-a-nested-root
#[test]
fn every_git_command_refuses_a_nested_root() {
    let outer = build("inbox");
    let root = outer.join("sub");
    let before = snapshot(&outer);
    let error = InboxFeature::new()
        .run(&Invocation::new(&root, "inbox", Vec::new()))
        .expect_err("the nested root is refused");
    assert_eq!(
        error.to_string(),
        format!(
            "inbox failed: {} is inside the git repository at {} but is not its top level; run osq from {} or set vcs.enabled to false",
            root.display(),
            outer.display(),
            outer.display()
        ),
        "the refusal message"
    );
    assert_eq!(snapshot(&outer), before, "the repository is untouched");
}
