//! Helpers shared by the manual feature's golden tests.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{self, Command};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_manual::ManualFeature;
use serde_json::Value;

/// The keep time every case uses, in epoch milliseconds.
const NOW_MS: i64 = 1_792_094_462_123;

/// The author every case writes into its `osq.toml`.
const AUTHOR: &str = "osq <osq@example.com>";

/// The path of one fixture folder under the crate's `tests/fixtures`.
fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// A scratch folder under the system temporary directory, removed on drop.
struct Scratch {
    /// The folder, made canonical.
    path: PathBuf,
}

impl Scratch {
    /// Creates a fresh empty folder named for `case` and this process.
    fn new(case: &str) -> Self {
        let path = std::env::temp_dir().join(format!("osq-manual-{case}-{}", process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("the scratch folder is created");
        let path = fs::canonicalize(path).expect("the scratch folder canonicalizes");
        Self { path }
    }
}

impl Drop for Scratch {
    /// Removes the scratch folder and everything it holds.
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
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

/// Writes one file under `root`, creating its folders.
fn write(root: &Path, relative: &str, contents: impl AsRef<[u8]>) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, contents).expect("the file is written");
}

/// Appends one file under `root` with `text`.
fn append(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    let mut file = OpenOptions::new()
        .append(true)
        .open(path)
        .expect("the file opens for appending");
    file.write_all(text.as_bytes())
        .expect("the text is appended");
}

/// Runs git in `cwd`, giving its standard output.
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

/// The `osq.toml` text a case's `vcs` block makes.
fn toml(vcs: &Value) -> String {
    let enabled = vcs["enabled"]
        .as_bool()
        .expect("the case names vcs.enabled");
    let mut text = format!("[vcs]\nenabled = {enabled}\nauthor = \"{AUTHOR}\"\n");
    if let Some(mode) = vcs["manualEdits"].as_str() {
        text.push_str("manualEdits = \"");
        text.push_str(mode);
        text.push_str("\"\n");
    }
    text
}

/// Runs one setup step from `cases.json` in the root and repository folders.
fn run_step(root: &Path, top: &Path, step: &Value) {
    if let Some(relative) = step["write"].as_str() {
        write(
            root,
            relative,
            step["text"].as_str().expect("the write step has text"),
        );
    } else if let Some(relative) = step["append"].as_str() {
        append(
            root,
            relative,
            step["text"].as_str().expect("the append step has text"),
        );
    } else if let Some(relative) = step["remove"].as_str() {
        fs::remove_file(root.join(relative)).expect("the step's file is removed");
    } else if let Some(from) = step["move"].as_str() {
        let to = step["to"].as_str().expect("the move step has a target");
        git(root, &["mv", from, to]);
    } else if let Some(key) = step["config"].as_str() {
        let value = step["value"].as_str().expect("the config step has a value");
        git(root, &["config", key, value]);
    } else if let Some(name) = step["hook"].as_str() {
        let hook = top.join(".git").join("hooks").join(name);
        fs::create_dir_all(hook.parent().expect("the hook has a folder"))
            .expect("the hook's folder is created");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").expect("the hook is written");
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755))
            .expect("the hook is executable");
    } else {
        panic!("unknown step {step}");
    }
}

/// Copies the fixture into the case's project root and writes its config.
fn set_up(scratch: &Path, case: &Value) -> PathBuf {
    let root = match case["git"].as_str().expect("the case names git") {
        "parent" => scratch.join("project"),
        _ => scratch.to_path_buf(),
    };
    copy_tree(&fixture("manual-project"), &root);
    write(&root, "osq.toml", toml(&case["vcs"]));
    if case["git"].as_str() != Some("none") {
        git(scratch, &["init", "-q", "-b", "main"]);
        git(scratch, &["config", "user.name", "Ada"]);
        git(scratch, &["config", "user.email", "ada@example.com"]);
        git(scratch, &["config", "commit.gpgsign", "false"]);
        git(scratch, &["add", "-A"]);
        git(scratch, &["commit", "-q", "-m", "init"]);
    }
    root
}

/// The record files under `root`, sorted, with their text.
fn records(root: &Path) -> Vec<String> {
    let folder = root.join("openspec").join("manual");
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    let mut lines = Vec::new();
    for name in names {
        let text = fs::read_to_string(root.join("openspec").join("manual").join(&name))
            .expect("the record reads");
        let text = text.strip_suffix('\n').unwrap_or(&text);
        lines.push(format!("== {name}"));
        lines.extend(text.split('\n').map(str::to_owned));
    }
    lines
}

/// The thrown message of a feature error, without the command prefix.
fn error_message(error: FeatureError) -> String {
    match error {
        FeatureError::Failed { message, .. } => message,
        other => other.to_string(),
    }
}

/// The seven-character short commit in a keep line, written `<commit>`.
fn normalized_line(line: &str) -> String {
    let Some((head, tail)) = line.rsplit_once(" as ") else {
        return line.to_owned();
    };
    if tail.len() == 7 && tail.chars().all(|character| character.is_ascii_hexdigit()) {
        format!("{head} as <commit>")
    } else {
        line.to_owned()
    }
}

/// The lines and error one feature run gives.
fn run_manual(root: &Path, case: &Value) -> (Vec<String>, Vec<String>) {
    let mut args = vec![
        case["comment"]
            .as_str()
            .expect("the case has a comment")
            .to_owned(),
    ];
    if let Some(paths) = case["paths"].as_array() {
        args.extend(
            paths
                .iter()
                .map(|path| path.as_str().expect("a named path is a string").to_owned()),
        );
    }
    match ManualFeature::at(NOW_MS).run(&Invocation::new(root, "manual", args)) {
        Ok(output) => {
            let text = output.text.trim_end_matches('\n');
            let lines = if text.is_empty() {
                Vec::new()
            } else {
                text.split('\n').map(normalized_line).collect()
            };
            (lines, Vec::new())
        }
        Err(error) => {
            let message = if case["gitRefuses"].as_bool() == Some(true) {
                "<commit refused>".to_owned()
            } else {
                error_message(error)
            };
            (Vec::new(), vec![message])
        }
    }
}

/// Renders one case as `print-goldens.mjs.txt` writes `<case>.txt`.
fn render(case: &Value) -> String {
    let name = case["name"].as_str().expect("the case has a name");
    let scratch = Scratch::new(name);
    let root = set_up(&scratch.path, case);
    for step in case["steps"].as_array().expect("the case has steps") {
        run_step(&root, &scratch.path, step);
    }
    let has_git = case["git"].as_str() != Some("none");
    let before = has_git.then(|| git(&scratch.path, &["rev-parse", "HEAD"]).trim().to_owned());
    let (lines, mut error) = run_manual(&root, case);
    let root_text = root.display().to_string();
    let top_text = scratch.path.display().to_string();
    for message in &mut error {
        *message = message
            .replace(&root_text, "<root>")
            .replace(&top_text, "<top>");
    }
    let after = has_git.then(|| git(&scratch.path, &["rev-parse", "HEAD"]).trim().to_owned());
    let head = if !has_git {
        "none"
    } else if before == after {
        "unchanged"
    } else {
        "new"
    };
    let moved = head == "new";
    let mut out = vec![
        format!("exit: {}", i32::from(!error.is_empty())),
        "lines:".to_owned(),
    ];
    out.extend(lines);
    out.push("error:".to_owned());
    out.extend(error);
    out.push(format!("head: {head}"));
    out.push("message:".to_owned());
    if moved {
        let message = git(&scratch.path, &["log", "-1", "--format=%B"]);
        let message = message.trim_end_matches('\n');
        out.extend(message.split('\n').map(str::to_owned));
    }
    out.push("author:".to_owned());
    if moved {
        out.push(
            git(&scratch.path, &["log", "-1", "--format=%an <%ae>"])
                .trim()
                .to_owned(),
        );
    }
    out.push("files:".to_owned());
    if moved {
        let files = git(
            &scratch.path,
            &["show", "--name-status", "--format=", "HEAD"],
        );
        out.extend(files.trim().lines().map(str::to_owned));
    }
    out.push("records:".to_owned());
    out.extend(records(&root));
    out.push("status:".to_owned());
    if has_git {
        let status = git(
            &scratch.path,
            &["status", "--porcelain=v1", "--untracked-files=all"],
        );
        let status = status.trim_end_matches('\n');
        if !status.is_empty() {
            out.extend(status.split('\n').map(str::to_owned));
        }
    }
    out.join("\n") + "\n"
}

/// The case named `name` from `cases.json`.
fn case_named(name: &str) -> Value {
    let text =
        fs::read_to_string(fixture("golden").join("cases.json")).expect("the cases file reads");
    let cases: Vec<Value> = serde_json::from_str(&text).expect("the cases file is JSON");
    cases
        .into_iter()
        .find(|case| case["name"].as_str() == Some(name))
        .unwrap_or_else(|| panic!("the cases file names {name}"))
}

/// Checks one case's whole dump against its golden.
pub fn check_case(name: &str) {
    let dump = render(&case_named(name));
    let path = fixture("golden").join(format!("{name}.txt"));
    let mut golden = fs::read_to_string(path).expect("the golden reads");
    if name == "block" {
        golden = golden.replace("osq.config.ts", "osq.toml");
    }
    assert_eq!(dump, golden, "{name}");
}

/// The refusal a tracked edit inside `openspec/changes` gives when no path is
/// named, which the goldens do not cover.
pub fn tracked_change_refusal() -> String {
    let case: Value = serde_json::json!({
        "name": "tracked-change",
        "vcs": { "enabled": true },
        "git": "root",
        "steps": [
            {
                "write": "openspec/changes/004-active/proposal.md",
                "text": "# Active, edited\n"
            }
        ],
        "comment": "x",
        "paths": []
    });
    let scratch = Scratch::new("tracked-change");
    let root = set_up(&scratch.path, &case);
    for step in case["steps"].as_array().expect("the case has steps") {
        run_step(&root, &scratch.path, step);
    }
    let (_, error) = run_manual(&root, &case);
    error.into_iter().next().expect("the case is refused")
}
