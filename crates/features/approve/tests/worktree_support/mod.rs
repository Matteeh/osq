//! Helpers for the worktree approval tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_approve::ApproveFeature;

/// The date every commit a test makes carries.
const DATE: &str = "2026-10-22T10:00:00Z";
/// The author every osq commit in a test carries.
const AUTHOR: &str = "Osq Bot <bot@example.com>";
/// The approval lines the goldens keep.
const KEPT: [&str; 5] = [
    "Approved ",
    "  Hash: ",
    "  Kept rejected branch: ",
    "  Worktree: ",
    "  Branch: ",
];

/// One scratch repository and the base commit every approval starts from.
pub struct Repo {
    /// The scratch root that holds `repo` and `worktrees`.
    pub root: PathBuf,
    /// The git repository under `root/repo`.
    pub path: PathBuf,
    /// The first commit's SHA.
    pub base: String,
}

impl Repo {
    /// The change folder's path inside the worktree.
    pub fn worktree_folder(&self, folder: &str) -> PathBuf {
        self.root
            .join("worktrees")
            .join("repo")
            .join(folder)
            .join("openspec/changes")
            .join(folder)
    }

    /// The tree record's path in the repository's git directory.
    pub fn record_path(&self) -> PathBuf {
        self.path.join(".git/osq-trees.jsonl")
    }
}

/// Builds a scratch repository for `name`, with the row's extra `osq.toml` lines.
pub fn build(name: &str, extras: &[&str]) -> Repo {
    let root = scratch(name);
    let path = root.join("repo");
    copy_tree(&fixture("approve-repo"), &path);
    git(&path, &["init", "-q", "-b", "main"]);
    git(&path, &["config", "user.name", "Osq Tester"]);
    git(&path, &["config", "user.email", "tester@example.com"]);
    git(&path, &["config", "commit.gpgsign", "false"]);
    exclude(&path);
    write_config(&path, &root.join("worktrees"), extras);
    git(
        &path,
        &["add", "-A", "--", ".", ":!openspec/changes/001-alpha-twice"],
    );
    git(&path, &["commit", "-q", "-m", "fixture"]);
    let base = git(&path, &["rev-parse", "HEAD"]).trim().to_owned();
    Repo { root, path, base }
}

/// Builds a scratch repository for `name` and runs `setup` before any approve.
pub fn build_with(name: &str, extras: &[&str], setup: impl FnOnce(&Repo)) -> Repo {
    let repo = build(name, extras);
    setup(&repo);
    repo
}

/// A fresh scratch copy of the `approve-repo` fixture under `CARGO_TARGET_TMPDIR`.
pub fn scratch_copy(name: &str) -> PathBuf {
    let root = scratch(name);
    copy_tree(&fixture("approve-repo"), &root);
    root
}

/// Writes `osq.toml` for a repository with git on, the worktree root and the
/// row's extra lines.
pub fn write_config(repo: &Path, worktrees: &Path, extras: &[&str]) {
    let mut text = format!(
        "[vcs]\nenabled = true\nauthor = \"{AUTHOR}\"\nworktreeRoot = \"{}\"\n",
        worktrees.display()
    );
    for line in extras {
        text.push_str(line);
        text.push('\n');
    }
    fs::write(repo.join("osq.toml"), text).expect("osq.toml is written");
}

/// Runs git in `cwd` with the tests' dates and identities, giving its stdout.
pub fn git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_AUTHOR_DATE", DATE)
        .env("GIT_COMMITTER_DATE", DATE)
        .env("GIT_AUTHOR_NAME", "Osq Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Osq Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
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

/// Runs `approve` through `ApproveFeature` with literal arguments.
pub fn approve(root: &Path, args: &[&str]) -> Result<Output, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    ApproveFeature.run(&Invocation::new(root, "approve", args))
}

/// Renders one run as the golden script does, with `<root>` and `<base>` put back.
pub fn render(repo: &Repo, folder: &str, result: &Result<Output, FeatureError>) -> String {
    let mut lines = vec![outcome_line(result), "branches:".to_owned()];
    lines.extend(branches(&repo.path));
    lines.push("worktrees:".to_owned());
    lines.extend(worktrees(&repo.path));
    let checkout = repo.path.join("openspec/changes").join(folder);
    lines.push(format!(
        "checkout copy: {}",
        if checkout.exists() {
            "present"
        } else {
            "absent"
        }
    ));
    lines.push("commit:".to_owned());
    lines.extend(commit_lines(repo, folder));
    lines.push("record:".to_owned());
    lines.extend(record_lines(repo));
    lines.push("tree:".to_owned());
    lines.push(tree_lines(&repo.worktree_folder(folder)));
    let root = repo.root.display().to_string();
    lines
        .join("\n")
        .replace(&root, "<root>")
        .replace(&repo.base, "<base>")
        .trim_end()
        .to_owned()
}

/// Every `osq/` branch in `repo`, sorted.
pub fn branches(repo: &Path) -> Vec<String> {
    let output = git(
        repo,
        &["branch", "--list", "osq/*", "--format=%(refname:short)"],
    );
    let mut lines: Vec<String> = output
        .lines()
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect();
    lines.sort();
    lines
}

/// Every osq worktree in `repo`, as `path branch`, sorted.
pub fn worktrees(repo: &Path) -> Vec<String> {
    let output = git(repo, &["worktree", "list", "--porcelain"]);
    let mut current: Option<(String, String)> = None;
    let mut lines = Vec::new();
    for line in output.split('\n') {
        if let Some(path) = line.strip_prefix("worktree ") {
            current = Some((path.to_owned(), String::new()));
        }
        if let Some(branch) = line.strip_prefix("branch refs/heads/")
            && let Some((_, found)) = current.as_mut()
        {
            branch.clone_into(found);
        }
        if line.is_empty()
            && let Some((path, branch)) = current.take()
            && branch.starts_with("osq/")
        {
            lines.push(format!("{path} {branch}"));
        }
    }
    lines.sort();
    lines
}

/// The lines of the tree record, with each `at` written as `<at>`.
pub fn record_lines(repo: &Repo) -> Vec<String> {
    let Ok(text) = fs::read_to_string(repo.record_path()) else {
        return Vec::new();
    };
    text.lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let mut value: serde_json::Value =
                serde_json::from_str(line).expect("a record line is JSON");
            value["at"] = serde_json::Value::String("<at>".to_owned());
            value.to_string()
        })
        .collect()
}

/// One record line with the actual root, for a direct comparison.
pub fn expected_record(op: &str, root: &Path) -> String {
    format!(
        "{{\"at\":\"<at>\",\"op\":\"{op}\",\"root\":\"{}\"}}",
        root.display()
    )
}

/// One record line with the golden's `<root>` placeholder.
pub fn golden_record(op: &str) -> String {
    format!("{{\"at\":\"<at>\",\"op\":\"{op}\",\"root\":\"<root>/repo\"}}")
}

/// A golden's text.
pub fn golden(name: &str) -> String {
    fs::read_to_string(fixture("approve-worktree").join(name)).expect("the golden reads")
}

/// A golden's text with `<root>` and `<base>` replaced by the repository's.
pub fn golden_with_paths(repo: &Repo, name: &str) -> String {
    golden(name)
        .replace("<root>", &repo.root.display().to_string())
        .replace("<base>", &repo.base)
}

/// A failed golden's message lines, with `<root>` replaced by the repository's.
pub fn golden_message(repo: &Repo, name: &str) -> String {
    let golden = golden_with_paths(repo, name);
    let mut lines = golden.lines();
    assert_eq!(lines.next(), Some("outcome: failed"), "{name}: outcome");
    let message: Vec<&str> = lines.take_while(|line| *line != "branches:").collect();
    message.join("\n").trim_end().to_owned()
}

/// The approval seal both worktree goldens of the fixture carry.
pub const SEAL: &str = "sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1";

/// The outcome section of a run, as the golden script writes it.
fn outcome_line(result: &Result<Output, FeatureError>) -> String {
    match result {
        Ok(output) => {
            let kept: Vec<&str> = output
                .text
                .lines()
                .filter(|line| KEPT.iter().any(|prefix| line.starts_with(prefix)))
                .collect();
            format!("outcome: output\n{}", kept.join("\n"))
        }
        Err(error) => {
            let text = error.to_string();
            let message = text.strip_prefix("approve failed: ").unwrap_or(&text);
            format!("outcome: failed\n{}", message.trim_end())
        }
    }
}

/// The approval commit section of a run, as the golden script writes it.
fn commit_lines(repo: &Repo, folder: &str) -> Vec<String> {
    let branch = format!("osq/{folder}");
    if git(&repo.path, &["branch", "--list", &branch])
        .trim()
        .is_empty()
    {
        return vec!["none".to_owned()];
    }
    let tip = git(&repo.path, &["rev-parse", &branch]).trim().to_owned();
    if tip == repo.base {
        return vec!["none".to_owned()];
    }
    let log = git(
        &repo.path,
        &["log", "-1", "--format=%s%n%an <%ae>%n%P", &tip],
    );
    let mut parts = log.trim().lines();
    let subject = parts.next().unwrap_or_default().to_owned();
    let author = parts.next().unwrap_or_default().to_owned();
    let parents = parts.next().unwrap_or_default();
    let mut lines = vec![subject, author, format!("parent {parents}")];
    let changed = git(
        &repo.path,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", &tip],
    );
    let mut entries: Vec<String> = changed
        .trim()
        .lines()
        .map(str::to_owned)
        .filter(|line| !left_out(line))
        .collect();
    entries.sort();
    lines.extend(entries);
    lines
}

/// Whether a commit line names a `.run` file the goldens leave out.
fn left_out(line: &str) -> bool {
    let Some((_, path)) = line.split_once('\t') else {
        return false;
    };
    path.ends_with("/.run/manifest.json") || path.ends_with("/.run/plan.jsonl")
}

/// The worktree copy's `.run/` files, as the golden script writes them.
fn tree_lines(folder: &Path) -> String {
    let mut files = Vec::new();
    files_under(folder, &folder.join(".run"), &mut files);
    files.sort();
    let mut lines = Vec::new();
    for relative in files {
        if relative == ".run/manifest.json" || relative == ".run/plan.jsonl" {
            continue;
        }
        let text = fs::read_to_string(folder.join(&relative)).expect("a .run file is text");
        lines.push(format!("--- {relative}"));
        lines.push(text.strip_suffix('\n').unwrap_or(&text).to_owned());
    }
    lines.join("\n")
}

/// Adds every file under `dir` to `files`, relative to `base`.
fn files_under(base: &Path, dir: &Path, files: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            files_under(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.push(relative);
        }
    }
}

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`, named `name`.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("approve_worktree")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    fs::canonicalize(root).expect("the scratch root canonicalizes")
}

/// The path of one fixture under the crate's `tests/fixtures`.
fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

/// Appends the settings files a repository ignores to `.git/info/exclude`.
fn exclude(repo: &Path) {
    let path = repo.join(".git/info/exclude");
    let mut text = fs::read_to_string(&path).unwrap_or_default();
    text.push_str("osq.config.mjs\nosq.toml\nnode_modules\n");
    fs::write(path, text).expect("the exclude file is written");
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the target folder is created");
    for entry in fs::read_dir(from).expect("the source folder is read") {
        let entry = entry.expect("the folder entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}
