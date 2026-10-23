//! Proves the built `osq-rs` binary's streams, output and exit codes.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command as ProcessCommand, Output as ProcessOutput};

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;
use osq_feature_plan::PlanFeature;
use osq_feature_report::ReportFeature;

/// The path of the built binary under test.
const BINARY: &str = env!("CARGO_BIN_EXE_osq-rs");

/// The fixture project the binary runs against.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project")
}

/// A fresh copy of the fixture project under `CARGO_TARGET_TMPDIR`.
fn copy_fixture(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    copy_tree(&fixture(), &root);
    root
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    for entry in fs::read_dir(from).expect("the fixture folder is read") {
        let entry = entry.expect("the fixture entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            fs::create_dir_all(&target).expect("the target folder is created");
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the fixture file is copied");
        }
    }
}

/// Runs the binary in `root` with literal arguments.
fn run_binary(root: &Path, arguments: &[&str]) -> ProcessOutput {
    ProcessCommand::new(BINARY)
        .args(arguments)
        .current_dir(root)
        .output()
        .expect("the binary runs")
}

/// Runs one feature's command in `root` with literal arguments.
fn run_feature(feature: &dyn Feature, root: &Path, arguments: &[&str]) -> String {
    let command = arguments.first().expect("a command is named");
    let invocation = Invocation::new(
        root,
        *command,
        arguments[1..]
            .iter()
            .map(|argument| (*argument).to_owned())
            .collect(),
    );
    feature
        .run(&invocation)
        .expect("the feature command succeeds")
        .text
}

/// The stdout of a process's output as text.
fn stdout(output: &ProcessOutput) -> String {
    String::from_utf8(output.stdout.clone()).expect("stdout is UTF-8")
}

/// The stderr of a process's output as text.
fn stderr(output: &ProcessOutput) -> String {
    String::from_utf8(output.stderr.clone()).expect("stderr is UTF-8")
}

/// Proves each command through the binary against its own feature's output.
///
/// Covers: rust-cli/commands-through-the-binary
#[test]
fn commands_through_the_binary() {
    let rows: [(&str, Box<dyn Feature>, &[&str]); 3] = [
        ("inbox", Box::new(InboxFeature::new()), &["inbox"]),
        ("queue", Box::new(PlanFeature::new()), &["queue"]),
        (
            "query",
            Box::new(ReportFeature),
            &["query", "SELECT 1 AS one"],
        ),
    ];
    for (name, feature, arguments) in rows {
        let binary_root = copy_fixture(&format!("binary-commands-{name}"));
        let feature_root = copy_fixture(&format!("feature-commands-{name}"));
        let expected = run_feature(feature.as_ref(), &feature_root, arguments);
        let output = run_binary(&binary_root, arguments);
        assert_eq!(stdout(&output), expected, "{name} stdout");
        assert_eq!(stderr(&output), "", "{name} stderr");
        assert_eq!(output.status.code(), Some(0), "{name} exit code");
    }
}

/// Proves that a feature error reaches stderr and exits 1.
///
/// Covers: rust-cli/feature-error-through-the-binary
#[test]
fn feature_error_through_the_binary() {
    let root = copy_fixture("binary-feature-error");
    let output = run_binary(&root, &["inbox", "extra"]);
    assert_eq!(stdout(&output), "", "no stdout");
    assert_eq!(stderr(&output), "usage of inbox: takes no arguments\n");
    assert_eq!(output.status.code(), Some(1), "exit code");
}

/// Proves that an unknown command exits 1 with one stderr line.
///
/// Covers: rust-cli/binary-exit-code
#[test]
fn binary_exit_code() {
    let root = copy_fixture("binary-exit-code");
    let output = run_binary(&root, &["nope"]);
    assert_eq!(stdout(&output), "", "no stdout");
    assert_eq!(stderr(&output), "unknown command: nope\n");
    assert_eq!(output.status.code(), Some(1), "exit code");
}

/// Proves that an argument that is not UTF-8 exits 1 with a one-line error.
#[cfg(unix)]
#[test]
fn argument_that_is_not_utf8() {
    use std::os::unix::ffi::OsStringExt as _;

    let root = copy_fixture("binary-invalid-utf8");
    let argument = OsString::from_vec(vec![0xff, b'x']);
    let output = ProcessCommand::new(BINARY)
        .arg(argument)
        .current_dir(&root)
        .output()
        .expect("the binary runs");
    assert!(stdout(&output).is_empty(), "no stdout");
    assert_eq!(stderr(&output).lines().count(), 1, "one stderr line");
    assert!(
        stderr(&output).starts_with("osq-rs: argument is not valid UTF-8: "),
        "{}",
        stderr(&output)
    );
    assert_eq!(output.status.code(), Some(1), "exit code");
}

/// Proves that a current directory that cannot be read exits 1 with one line.
#[cfg(target_os = "linux")]
#[test]
fn current_directory_that_cannot_be_read() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("binary-cwd-gone");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    let script = "dir=$1; shift; cd \"$dir\" || exit 99; rmdir \"$dir\" || exit 98; exec \"$@\"";
    let output = ProcessCommand::new("sh")
        .arg("-c")
        .arg(script)
        .arg("sh")
        .arg(&root)
        .arg(BINARY)
        .arg("--help")
        .output()
        .expect("the shell runs the binary");
    assert!(stdout(&output).is_empty(), "no stdout");
    assert_eq!(stderr(&output).lines().count(), 1, "one stderr line");
    assert!(
        stderr(&output).starts_with("osq-rs: cannot read the current directory: "),
        "{}",
        stderr(&output)
    );
    assert_eq!(output.status.code(), Some(1), "exit code");
}
