//! Proves `plan <name> --brief <file>` writes TypeScript's change folder.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_plan::PlanFeature;

/// The fixed time whose UTC date the brief goldens record.
const TIME: i64 = 1_792_843_200_000;

/// The plan crate's test fixtures folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// The brief goldens folder.
fn goldens() -> PathBuf {
    fixtures().join("brief-created")
}

/// Creates a scratch root for one test row, removing any left-over folder.
fn scratch(test: &str, row: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("plan_brief")
        .join(test)
        .join(row);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
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

/// Reads every file under a folder into its relative path and bytes.
fn files(base: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(base, base, &mut files);
    files
}

/// Adds one folder's files, descending into its folders.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
    for entry in fs::read_dir(folder).expect("the folder is read") {
        let entry = entry.expect("the folder entry is read");
        let path = entry.path();
        if entry.file_type().expect("the entry type is read").is_dir() {
            collect(base, &path, files);
            continue;
        }
        let relative = path
            .strip_prefix(base)
            .expect("the file sits under the base folder")
            .to_owned();
        files.insert(relative, fs::read(&path).expect("the file is read"));
    }
}

/// Writes one file under `root`, creating its folders.
fn write(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the file's folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs `plan` with the given arguments, giving its output.
fn run_plan(root: &Path, args: &[&str]) -> Result<String, FeatureError> {
    PlanFeature::at(TIME)
        .run(&Invocation::new(
            root,
            "plan",
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        ))
        .map(|output| output.text)
}

/// A golden text with the scratch root written `<root>`.
fn golden(name: &str, root: &Path) -> String {
    fs::read_to_string(goldens().join(name))
        .expect("the golden reads")
        .replace("<root>", &root.display().to_string())
}

/// Runs git in `root` with a fixed identity and no machine configuration.
fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_AUTHOR_NAME", "Osq Test")
        .env("GIT_AUTHOR_EMAIL", "osq@example.com")
        .env("GIT_COMMITTER_NAME", "Osq Test")
        .env("GIT_COMMITTER_EMAIL", "osq@example.com")
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Prepares the scratch root of one "Brief refusals" row.
fn prepare_refusal(root: &Path, row: &str) {
    write(root, "b.md", "Do it.\n");
    if row == "archived" || row == "landed" {
        write(
            root,
            "openspec/changes/archive/001-a/proposal.md",
            "---\ntitle: A\n---\n",
        );
    }
    if row == "landed" {
        write(
            root,
            "osq.toml",
            "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
        );
        git(root, &["init", "-q", "-b", "main"]);
        git(root, &["add", "-A"]);
        git(root, &["commit", "-q", "-m", "fixture"]);
    }
}

/// Proves every row of "Golden brief change".
///
/// Covers: rust-plan/golden-brief-change
#[test]
fn golden_brief_change() {
    let rows: [(&str, &[&str], &str, bool); 2] = [
        (
            "handoff",
            &["Add dark mode!", "--brief", "brief-in.md"],
            "handoff.txt",
            false,
        ),
        (
            "print",
            &["Add dark mode!", "--brief", "brief-in.md", "--print"],
            "print.txt",
            true,
        ),
    ];
    let created = goldens().join("005-add-dark-mode");
    for (name, args, golden_name, printed) in rows {
        let root = scratch("golden_brief_change", name);
        copy_tree(&fixtures().join("plan-repo"), &root);
        fs::copy(goldens().join("brief-in.md"), root.join("brief-in.md"))
            .expect("the brief is copied");
        let output = run_plan(&root, args).unwrap_or_else(|error| panic!("row {name}: {error}"));
        assert_eq!(output, golden(golden_name, &root), "row {name} output");
        let folder = root.join("openspec/changes/005-add-dark-mode");
        let mut expected = files(&created);
        if printed {
            expected.remove(Path::new("plan-prompt.md"));
        }
        assert_eq!(files(&folder), expected, "row {name} folder files");
    }
}

/// Proves every row of "Brief refusals".
///
/// Covers: rust-plan/brief-refusals
#[test]
fn brief_refusals() {
    let rows: [(&str, &[&str], &str, bool); 5] = [
        (
            "archived",
            &["001", "--brief", "b.md"],
            "001-a has archived, so osq plan 001 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.",
            false,
        ),
        (
            "landed",
            &["001", "--brief", "b.md"],
            "001-a has landed, so osq plan 001 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.",
            false,
        ),
        (
            "number",
            &["7", "--brief", "b.md"],
            "osq plan 7 names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.",
            false,
        ),
        (
            "empty slug",
            &["!!!", "--brief", "b.md"],
            "Spec name cannot be empty",
            false,
        ),
        (
            "missing brief",
            &["x", "--brief", "nope.md"],
            "Cannot read brief nope.md: ",
            true,
        ),
    ];
    for (name, args, expected, starts_with) in rows {
        let root = scratch("brief_refusals", name);
        prepare_refusal(&root, name);
        let before = files(&root);
        match run_plan(&root, args) {
            Err(FeatureError::Failed {
                command, message, ..
            }) => {
                assert_eq!(command.as_str(), "plan", "row {name} command");
                if starts_with {
                    assert!(
                        message.starts_with(expected),
                        "row {name} message {message:?} starts {expected:?}"
                    );
                } else {
                    assert_eq!(message, expected, "row {name} message");
                }
            }
            other => panic!("row {name} expects a Failed error, got {other:?}"),
        }
        assert_eq!(files(&root), before, "row {name} writes nothing");
    }
}

/// Proves "Brief name of an active change".
///
/// Covers: rust-plan/brief-name-of-an-active-change
#[test]
fn brief_name_of_an_active_change() {
    let root = scratch("brief_name_of_an_active_change", "001");
    copy_tree(&fixtures().join("steer-project"), &root);
    let output = run_plan(&root, &["001", "--brief", "nope.md"]).expect("the plan succeeds");
    let expected = fs::read_to_string(fixtures().join("steer-golden").join("blocked-001.out.txt"))
        .expect("the golden reads")
        .replace("<root>", &root.display().to_string());
    assert_eq!(output, expected);
}

/// Proves every row of "Brief change names".
///
/// Covers: rust-plan/brief-change-names
#[test]
fn brief_change_names() {
    let rows: [(&str, &str, &str, &str); 2] = [
        (
            "padded",
            "  Fix the Login page ",
            "001-fix-the-login-page",
            "title: Fix the Login page",
        ),
        ("colon", "Fix: login", "001-fix-login", "title: Fix: login"),
    ];
    for (name, given, folder_name, title_line) in rows {
        let root = scratch("brief_change_names", name);
        write(&root, "b.md", "Do it.\n");
        run_plan(&root, &[given, "--brief", "b.md"]).unwrap_or_else(|error| {
            panic!("row {name}: {error}");
        });
        let folder = root.join("openspec/changes").join(folder_name);
        let proposal = fs::read_to_string(folder.join("proposal.md")).expect("the proposal reads");
        assert_eq!(
            proposal.lines().nth(1),
            Some(title_line),
            "row {name} title line"
        );
        let prompt = fs::read_to_string(folder.join("plan-prompt.md")).expect("the prompt reads");
        assert!(
            prompt.contains(&format!(
                "# Change: 001 - {}",
                title_line.trim_start_matches("title: ")
            )),
            "row {name} change line"
        );
    }
}
