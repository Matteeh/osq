//! Helpers shared by the run feature's tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_run::RunFeature;
use osq_kernel_storage::change_folder_seal;

/// The change folder every run test executes.
pub const FOLDER: &str = "001-a";

/// The task every run test executes.
pub const TASK: &str = "1";

/// The date every test commit gets.
const DATE: &str = "2000-01-01T00:00:00+0000";
/// The author and committer name every test commit gets.
const NAME: &str = "Osq Test";
/// The author and committer email every test commit gets.
const EMAIL: &str = "osq@example.com";

/// The path of one fixture folder under the crate's `tests/fixtures`.
pub fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// A fresh empty scratch root under `CARGO_TARGET_TMPDIR`, named `name`.
pub fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("run_feature")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// A fresh scratch copy of the run fixture, committed, with pi configured.
pub fn repo(name: &str) -> PathBuf {
    let root = scratch(name);
    copy_tree(&fixture("run-project"), &root);
    git(&root, &["init", "-q"]);
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-q", "-m", "fixture"]);
    write(
        &root,
        "osq.toml",
        "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"fake-pi\"\n",
    );
    write_seal(&root);
    root
}

/// Copies a folder tree, dot folders and files included.
pub fn copy_tree(from: &Path, to: &Path) {
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

/// Runs `git` in `root` with isolated settings, giving its standard output.
pub fn git(root: &Path, args: &[&str]) -> String {
    let mut command = Command::new("git");
    command.args(args).current_dir(root);
    command
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", root)
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "maintenance.auto")
        .env("GIT_CONFIG_VALUE_0", "false")
        .env("GIT_AUTHOR_NAME", NAME)
        .env("GIT_AUTHOR_EMAIL", EMAIL)
        .env("GIT_AUTHOR_DATE", DATE)
        .env("GIT_COMMITTER_NAME", NAME)
        .env("GIT_COMMITTER_EMAIL", EMAIL)
        .env("GIT_COMMITTER_DATE", DATE);
    let output = command.output().expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed in {}: {}",
        args.join(" "),
        root.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

/// The repository's porcelain status, or none outside a repository.
pub fn status(root: &Path) -> Option<String> {
    root.join(".git")
        .exists()
        .then(|| git(root, &["status", "--porcelain=v1", "--untracked-files=all"]))
}

/// Writes one file under `root`, creating its folders.
pub fn write(root: &Path, relative: &str, contents: impl AsRef<[u8]>) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, contents).expect("the file is written");
}

/// Reads one file under `root` as text.
pub fn read_text(root: &Path, relative: &str) -> String {
    fs::read_to_string(root.join(relative)).expect("the file reads as text")
}

/// Removes one file under `root`.
pub fn remove(root: &Path, relative: &str) {
    fs::remove_file(root.join(relative)).expect("the file is removed");
}

/// Whether a file or folder under `root` exists.
pub fn exists(root: &Path, relative: &str) -> bool {
    root.join(relative).exists()
}

/// The change folder's path.
pub fn change(root: &Path) -> PathBuf {
    root.join("openspec").join("changes").join(FOLDER)
}

/// Writes `.run/approved` holding the change folder's current seal.
pub fn write_seal(root: &Path) -> String {
    let seal = current_seal(root);
    write(
        root,
        &format!("openspec/changes/{FOLDER}/.run/approved"),
        format!("{seal}\n"),
    );
    seal
}

/// The seal `change_folder_seal` gives the change folder now.
pub fn current_seal(root: &Path) -> String {
    change_folder_seal(&change(root))
        .expect("the change folder seals")
        .as_str()
        .to_owned()
}

/// Every file under one folder, as relative path and bytes.
pub fn tree(root: &Path, relative: &str) -> BTreeMap<String, Vec<u8>> {
    let base = root.join(relative);
    let mut files = BTreeMap::new();
    collect(&base, &base, &mut files);
    files
}

/// Adds one folder's files to `files`, descending into its folders.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, fs::read(path).expect("the file is read"));
        }
    }
}

/// The last non-empty line of a task's event file.
pub fn last_event(root: &Path, task: &str) -> String {
    let text = read_text(
        root,
        &format!("openspec/changes/{FOLDER}/.run/events/{task}.jsonl"),
    );
    text.lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .expect("the task's event file has a line")
        .to_owned()
}

/// Runs the run feature's `run` with two arguments at `root`.
pub fn run(root: &Path, args: &[&str]) -> Result<Output, FeatureError> {
    run_args(root, "run", args)
}

/// Runs the run feature's `command` with literal `args` at `root`.
pub fn run_args(root: &Path, command: &str, args: &[&str]) -> Result<Output, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    RunFeature.run(&Invocation::new(root, command, args))
}

/// The current time in the fixed UTC form the run feature writes.
pub fn now_utc() -> String {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_utc(i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
}

/// Writes epoch milliseconds as `YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC.
fn format_utc(ms: i64) -> String {
    let seconds = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = seconds.div_euclid(86_400);
    let day_seconds = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = day_seconds / 3_600;
    let minute = (day_seconds % 3_600) / 60;
    let second = day_seconds % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// Turns days since the Unix epoch into a proleptic Gregorian date.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}
