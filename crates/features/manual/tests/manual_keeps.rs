//! Proves manual's keeps against the goldens TypeScript printed.

mod support;

#[path = "../src/time.rs"]
mod time;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{self, Command};
use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Feature, Invocation};
use osq_feature_manual::ManualFeature;
use osq_kernel_storage::{ManualEdit, read_manual_edits};

/// The keep cases of `cases.json`, in the requirement's order.
const CASES: [&str; 9] = [
    "tracked",
    "named-untracked",
    "folder-prefix",
    "rename",
    "multiline",
    "change-folders-left-out",
    "unowned",
    "author-fallback",
    "commit-fails",
];

/// The keep time the planner case uses, in epoch milliseconds.
const NOW_MS: i64 = 1_792_094_462_123;

/// A scratch repository under the system temporary directory, removed on drop.
struct Scratch {
    /// The repository's top level.
    path: PathBuf,
}

impl Scratch {
    /// Creates a fresh repository named for this test and process.
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!("osq-manual-{name}-{}", process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("the scratch folder is created");
        let path = fs::canonicalize(path).expect("the scratch folder canonicalizes");
        Self { path }
    }
}

impl Drop for Scratch {
    /// Removes the scratch repository and everything it holds.
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

/// Copies a folder tree, the fixture's dot files included.
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

/// Writes one file under `root`, creating its folders.
fn write(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Runs git in `cwd`, giving its trimmed standard output.
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
    String::from_utf8(output.stdout)
        .expect("git writes text")
        .trim()
        .to_owned()
}

/// Proves every row of "Manual keep equals TypeScript's".
///
/// Covers: rust-manual/manual-keep-equals-typescript-s
#[test]
fn manual_keep_equals_typescripts() {
    for name in CASES {
        support::check_case(name);
    }
}

/// Proves the planner reads the folder-prefix case's kept edit.
///
/// Covers: rust-manual/the-planner-reads-a-kept-edit
#[test]
fn planner_reads_a_kept_edit() {
    let scratch = Scratch::new("planner-reads");
    let root = scratch.path.as_path();
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("manual-project");
    copy_tree(&fixture, root);
    write(
        root,
        "osq.toml",
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
    );
    git(root, &["init", "-q", "-b", "main"]);
    git(root, &["config", "user.name", "Ada"]);
    git(root, &["config", "user.email", "ada@example.com"]);
    git(root, &["config", "commit.gpgsign", "false"]);
    git(root, &["add", "-A"]);
    git(root, &["commit", "-q", "-m", "init"]);
    write(root, "src/app.ts", "export const app = 2;\n");
    write(root, "src/lib/util.ts", "export const util = 2;\n");
    write(root, "notes/todo.txt", "done\n");
    let invocation = Invocation::new(
        root,
        "manual",
        vec!["bump the source".to_owned(), "src/".to_owned()],
    );
    ManualFeature::at(NOW_MS)
        .run(&invocation)
        .expect("the folder-prefix case is kept");
    assert_eq!(
        read_manual_edits(root),
        vec![ManualEdit {
            file: "2026-10-15T20-01-02-123Z.md".to_owned(),
            kept_at: "2026-10-15T20:01:02.123Z".to_owned(),
            paths: vec!["src/app.ts".to_owned(), "src/lib/util.ts".to_owned()],
            capabilities: vec!["alpha".to_owned(), "beta".to_owned()],
            comment: "bump the source".to_owned(),
        }]
    );
}

/// Proves the fixed UTC form across era, leap-year and month edges.
///
/// Covers: rust-manual/manual-keep-equals-typescript-s
#[test]
fn utc_text_for_fixed_times() {
    let rows: [(i64, &str); 16] = [
        (-62_162_121_600_000, "0000-02-29T00:00:00.000Z"),
        (-62_162_035_200_001, "0000-02-29T23:59:59.999Z"),
        (-62_162_035_200_000, "0000-03-01T00:00:00.000Z"),
        (-62_135_596_800_000, "0001-01-01T00:00:00.000Z"),
        (-59_006_316_303_211, "0100-03-01T12:34:56.789Z"),
        (-49_539_254_400_001, "0400-02-29T23:59:59.999Z"),
        (-11_670_998_400_000, "1600-02-29T00:00:00.000Z"),
        (-1, "1969-12-31T23:59:59.999Z"),
        (0, "1970-01-01T00:00:00.000Z"),
        (951_804_428_009, "2000-02-29T06:07:08.009Z"),
        (1_709_208_000_000, "2024-02-29T12:00:00.000Z"),
        (1_735_689_599_999, "2024-12-31T23:59:59.999Z"),
        (1_735_689_600_000, "2025-01-01T00:00:00.000Z"),
        (1_792_231_200_000, "2026-10-17T10:00:00.000Z"),
        (13_574_563_200_000, "2400-02-29T00:00:00.000Z"),
        (253_402_300_799_999, "9999-12-31T23:59:59.999Z"),
    ];
    for (ms, expected) in rows {
        assert_eq!(time::format_utc(ms), expected, "{ms}");
    }
    let before = elapsed_ms();
    let now = time::now_ms();
    let after = elapsed_ms();
    assert!(before <= now && now <= after, "the clock is UTC now");
}

/// The current time as epoch milliseconds, for the clock's bounds.
fn elapsed_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the clock is after the epoch");
    i64::try_from(elapsed.as_millis()).expect("the time fits in i64")
}
