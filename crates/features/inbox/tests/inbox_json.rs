//! Proves the inbox JSON and text against TypeScript's goldens.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;
use osq_kernel_storage::watch_state_dir;

/// The fixed time every golden was printed at.
const NOW_MS: i64 = 1_792_843_200_000;

/// The cursor every run writes at [`NOW_MS`].
const CURSOR: &str = "{\"lastLook\":\"2026-10-24T12:00:00.000Z\"}\n";

/// A fresh scratch base folder named after one test and row.
fn scratch(name: &str) -> PathBuf {
    let base = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("inbox_json")
        .join(name);
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    base
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Copies `from` into `to`, including every file and folder.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let path = entry.path();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&path, &target);
        } else {
            fs::copy(&path, &target).unwrap();
        }
    }
}

/// Runs git in a folder, failing with both streams when it refuses.
fn git(repo: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo)
        .env("GIT_AUTHOR_NAME", "osq")
        .env("GIT_AUTHOR_EMAIL", "osq@example.com")
        .env("GIT_COMMITTER_NAME", "osq")
        .env("GIT_COMMITTER_EMAIL", "osq@example.com")
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {args:?}: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Commits every change in a worktree or the checkout.
fn commit(repo: &Path, message: &str) {
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-q", "-m", message]);
}

/// Initialises a git repository on `main` with osq's identity.
fn init_repo(repo: &Path) {
    git(repo, &["init", "-q", "-b", "main"]);
    git(repo, &["config", "user.name", "osq"]);
    git(repo, &["config", "user.email", "osq@example.com"]);
}

/// The cursor file path under `home` for `root`.
fn cursor_path(root: &Path, home: &Path) -> PathBuf {
    let state = watch_state_dir(root, home);
    let name = state.file_name().unwrap().to_string_lossy();
    home.join(".osq")
        .join("last-look")
        .join(format!("{name}.json"))
}

/// Runs `inbox` with the row's arguments at the golden time.
fn run(root: &Path, home: &Path, args: &[&str]) -> String {
    let invocation = Invocation::new(
        root,
        "inbox",
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    );
    InboxFeature::at(NOW_MS)
        .with_home(home)
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// Asserts the cursor file holds the time of the run.
fn assert_cursor(root: &Path, home: &Path) {
    assert_eq!(fs::read_to_string(cursor_path(root, home)).unwrap(), CURSOR);
}

/// A base folder with the repository fixture copied to `checkout`.
fn repo_case(name: &str, cursor: bool) -> (PathBuf, PathBuf) {
    let base = scratch(name);
    let root = base.join("checkout");
    let home = base.join("home");
    fs::create_dir_all(&home).unwrap();
    copy_dir(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/repo"),
        &root,
    );
    if cursor {
        write(
            &cursor_path(&root, &home),
            "{\"lastLook\":\"2026-10-01T10:00:00.000Z\"}\n",
        );
    }
    (root, home)
}

/// A base folder with the records fixture built into its git repository.
fn records_case(name: &str) -> (PathBuf, PathBuf) {
    let base = scratch(name);
    let root = base.join("checkout");
    let home = base.join("home");
    let worktree = base.join("worktree");
    let keep = base.join("keep");
    fs::create_dir_all(&home).unwrap();
    copy_dir(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/json-records"),
        &root,
    );
    let wait = root.join("openspec/changes/archive/033-wait");
    fs::rename(&wait, &keep).unwrap();
    write(
        &root.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
    );
    init_repo(&root);
    commit(&root, "all");
    git(
        &root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/033-wait",
            worktree.to_str().unwrap(),
        ],
    );
    copy_dir(&keep, &worktree.join("openspec/changes/archive/033-wait"));
    fs::remove_dir_all(&keep).unwrap();
    commit(&worktree, "archive 033");
    write(
        &root.join("openspec/changes/030-run/.run/running/1.pid"),
        &format!(
            "{{\"pid\":{},\"startedAt\":1792843075000}}",
            std::process::id()
        ),
    );
    write(
        &watch_state_dir(&root, &home).join("after-land.json"),
        "{\"change\":\"035-gone\",\"command\":\"pnpm build\",\"exitCode\":1,\"failedAt\":\"2026-10-24T11:00:00.000Z\"}\n",
    );
    (root, home)
}

/// Replaces this process's pid with the golden's `<pid>` placeholder.
fn without_own_pid(text: &str) -> String {
    text.replace(
        &format!("\"pid\": {}", std::process::id()),
        "\"pid\": <pid>",
    )
}

/// Proves the repository fixture's JSON equals TypeScript's.
///
/// Covers: rust-inbox/inbox-json-equals-typescript-s
#[test]
fn inbox_json_equals_typescripts_repo() {
    let (root, home) = repo_case("inbox_json_equals_typescripts_repo", false);
    let output = run(&root, &home, &["--json"]);
    assert_eq!(output, include_str!("fixtures/json-golden/repo.json"));
    assert_cursor(&root, &home);
}

/// Proves the repository fixture with a cursor equals TypeScript's JSON.
///
/// Covers: rust-inbox/inbox-json-equals-typescript-s
#[test]
fn inbox_json_equals_typescripts_repo_cursor() {
    let (root, home) = repo_case("inbox_json_equals_typescripts_repo_cursor", true);
    let output = run(&root, &home, &["--json"]);
    assert_eq!(
        output,
        include_str!("fixtures/json-golden/repo-cursor.json")
    );
    assert_cursor(&root, &home);
}

/// Proves the records fixture's JSON equals TypeScript's.
///
/// Covers: rust-inbox/inbox-json-equals-typescript-s
#[test]
fn inbox_json_equals_typescripts_records() {
    let (root, home) = records_case("inbox_json_equals_typescripts_records");
    let output = without_own_pid(&run(&root, &home, &["--json"]));
    assert_eq!(output, include_str!("fixtures/json-golden/records.json"));
    assert_cursor(&root, &home);
}

/// Proves the records fixture's text equals TypeScript's.
///
/// Covers: rust-inbox/inbox-json-equals-typescript-s
#[test]
fn inbox_text_equals_typescripts_records() {
    let (root, home) = records_case("inbox_text_equals_typescripts_records");
    let output = without_own_pid(&run(&root, &home, &[]));
    assert_eq!(output, include_str!("fixtures/json-golden/records.txt"));
}
