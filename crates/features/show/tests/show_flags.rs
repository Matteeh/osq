//! Proves the approval digest's `Flag:` lines equal TypeScript's.

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// The fixture project every flags test copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// Creates a scratch copy of the fixture with the running marker git ignores.
fn copy_fixture(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    copy_dir(&fixture(), &root);
    write(
        &root.join("openspec/changes/003-running/.run/running/1.pid"),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
    root
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs show with one literal argument on a root.
fn run(root: &Path, argument: &str) -> String {
    ShowFeature
        .run(&Invocation::new(root, "show", vec![argument.to_owned()]))
        .expect("the change is shown")
        .text
}

/// Proves the whole output of the active and unplanned changes, flags included.
///
/// Covers: rust-show/show-digest-flags
#[test]
fn show_digest_flags() {
    let root = copy_fixture("show-flags");
    let cases = [
        ("1", include_str!("fixtures/golden/active-001.txt")),
        ("007", include_str!("fixtures/golden/unplanned-007.txt")),
    ];
    for (argument, golden) in cases {
        assert_eq!(run(&root, argument), golden, "text differs for {argument}");
    }
}

/// Creates an empty scratch root.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes a proposal with a verify command, an optional decisions body and creates list.
fn proposal(root: &Path, verify: &str, decisions: &str, creates: &[&str]) {
    let mut text = format!("---\ntitle: A works\nverify: {verify}\n");
    if !creates.is_empty() {
        let _ = writeln!(text, "creates: [{}]", creates.join(", "));
    }
    text.push_str("---\n## Goal\n\nA goal.\n");
    if !decisions.is_empty() {
        let _ = write!(text, "\n## Decisions\n\n{decisions}\n");
    }
    write(&root.join("openspec/changes/001-edge/proposal.md"), &text);
}

/// Writes one task file with a verify, start, scope and optional tests.modify.
fn task(root: &Path, number: &str, verify: &str, starts: &str, scope: &[&str], modify: bool) {
    let mut scope_yaml = String::new();
    for entry in scope {
        let _ = writeln!(scope_yaml, "  - {entry}");
    }
    let tests = if modify {
        "tests:\n  modify: true\n"
    } else {
        ""
    };
    let text = format!(
        "---\ntitle: Task {number}\nverify: {verify}\nverify_starts: {starts}\nscope:\n{scope_yaml}{tests}---\n## Acceptance\n\n- [ ] It works.\n"
    );
    write(
        &root
            .join("openspec/changes/001-edge/tasks")
            .join(format!("{number}.md")),
        &text,
    );
}

/// The `Flag:` lines of one change's whole show output.
fn flag_lines(root: &Path) -> Vec<String> {
    run(root, "1")
        .split('\n')
        .filter(|line| line.starts_with("Flag: "))
        .map(ToOwned::to_owned)
        .collect()
}

/// One expected flag line.
fn flag(label: &str, excerpt: &str) -> String {
    format!("Flag: {label} \u{2014} {excerpt}")
}

/// Proves every sensitive kind, kind order, path order and task-number order.
///
/// Covers: rust-show/show-digest-flags
#[test]
fn sensitive_paths_follow_typescript() {
    let root = scratch("show-flags-sensitive");
    proposal(&root, "cargo test", "", &[]);
    task(
        &root,
        "10",
        "cargo test",
        "red",
        &["go.sum", ".gitlab-ci.yml", ".env", "src/shared.ts"],
        false,
    );
    task(
        &root,
        "2",
        "cargo test",
        "red",
        &[
            "package.json",
            "pnpm-lock.yaml",
            ".github/workflows/ci.yml",
            ".github/workflows/*.secret",
            "osq.config.ts",
            "openspec/config.yaml",
            "AGENTS.md",
            ".claude/commands/osq-plan.md",
            ".opencode/agent/x.md",
            ".env.example",
            ".env",
            ".env.local",
            "src/shared.ts",
        ],
        false,
    );
    task(
        &root,
        "a",
        "cargo test",
        "red",
        &[".env", "src/shared.ts"],
        false,
    );
    let expected = vec![
        flag(
            "shared files in tasks 2 and 10",
            ".env, src/shared.ts; when task 10 changes them, the watcher re-runs task 2's verify and halts only if it fails",
        ),
        flag(
            "shared files in tasks 2 and a",
            ".env, src/shared.ts; when task a changes them, the watcher re-runs task 2's verify and halts only if it fails",
        ),
        flag(
            "shared files in tasks 10 and a",
            ".env, src/shared.ts; when task a changes them, the watcher re-runs task 10's verify and halts only if it fails",
        ),
        flag("package manifest in scope", "package.json in task 2"),
        flag(
            "lockfile in scope",
            "go.sum in task 10; pnpm-lock.yaml in task 2",
        ),
        flag(
            "CI workflow in scope",
            ".github/workflows/ci.yml in task 2; .gitlab-ci.yml in task 10",
        ),
        flag("osq config in scope", "osq.config.ts in task 2"),
        flag("OpenSpec config in scope", "openspec/config.yaml in task 2"),
        flag(
            "managed instructions in scope",
            ".claude/commands/osq-plan.md in task 2; .opencode/agent/x.md in task 2; AGENTS.md in task 2",
        ),
        flag(
            "env file in scope",
            ".env in tasks 2, 10, a; .env.local in task 2",
        ),
    ];
    assert_eq!(flag_lines(&root), expected);
}

/// Proves the verify-path operands and verify-start conflict rules.
///
/// Covers: rust-show/show-digest-flags
#[test]
fn verify_start_conflicts_follow_typescript() {
    let root = scratch("show-flags-starts");
    proposal(&root, "cargo test", "", &[]);
    task(
        &root,
        "1",
        "node --test tools/red.ts",
        "red",
        &["tools/red.ts"],
        false,
    );
    task(
        &root,
        "2",
        "node --test tools/missing1.ts --flag --dir/file /abs/path KEY=dir/file https://example.com/x.txt bare \"tools/quoted.ts\" src\\missing3.ts tools/existing.ts",
        "green",
        &[
            "tools/missing1.ts",
            "--flag",
            "--dir/file",
            "/abs/path",
            "KEY=dir/file",
            "https://example.com/x.txt",
            "bare",
            "tools/quoted.ts",
            "src/missing3.ts",
            "tools/existing.ts",
        ],
        false,
    );
    write(&root.join("tools/existing.ts"), "export {};\n");
    task(
        &root,
        "3",
        "node --test tools/other.ts",
        "green",
        &[],
        false,
    );
    task(
        &root,
        "4",
        "node --test \"specs/*.md\"",
        "any",
        &["./specs/*.md"],
        false,
    );
    let expected = vec![
        flag(
            "verify starts conflict in task 2",
            "src\\missing3.ts is named by the verify but created by this task, which declares verify_starts: green",
        ),
        flag(
            "verify starts conflict in task 2",
            "tools/missing1.ts is named by the verify but created by this task, which declares verify_starts: green",
        ),
        flag(
            "verify starts conflict in task 2",
            "tools/quoted.ts is named by the verify but created by this task, which declares verify_starts: green",
        ),
        flag(
            "verify starts conflict in task 4",
            "specs/*.md is named by the verify but created by this task, which declares verify_starts: any",
        ),
    ];
    assert_eq!(flag_lines(&root), expected);
}

/// Proves every verify-without-a-test rule TypeScript applies.
///
/// Covers: rust-show/show-digest-flags
#[test]
fn verify_without_test_follows_typescript() {
    let root = scratch("show-flags-verify");
    proposal(&root, "node other.mjs", "", &[]);
    let cases = [
        ("1", "node test/a"),
        ("2", "node tests/a"),
        ("3", "node __tests__/a"),
        ("4", "node src/tests/a"),
        ("5", "node src/test/a"),
        ("6", "node src/__tests__/a"),
        ("7", "node foo/tests"),
        ("8", "node testx/a"),
        ("9", "node foo.test.ts"),
        ("10", "node foo.spec.ts"),
        ("11", "vitest run"),
        ("12", "go test ./..."),
        ("13", "npm test"),
        ("14", "pnpm run test"),
        ("15", "yarn verify"),
        ("16", "bun test"),
        ("17", "x npm test"),
        ("18", "xpnpm test"),
        ("19", "x_pnpm test"),
        ("20", "npm -- test"),
        ("21", "runtest"),
        ("22", "(npm test"),
        ("23", "npmrun test"),
        ("24", "npm runtest"),
        ("25", "test/a"),
        ("26", "tests/a"),
        ("27", "npm test;"),
    ];
    for (number, verify) in cases {
        task(&root, number, verify, "red", &[], false);
    }
    let flagged = [
        ("7", "node foo/tests"),
        ("8", "node testx/a"),
        ("18", "xpnpm test"),
        ("19", "x_pnpm test"),
        ("20", "npm -- test"),
        ("21", "runtest"),
        ("23", "npmrun test"),
        ("24", "npm runtest"),
    ];
    let mut expected: Vec<String> = flagged
        .iter()
        .map(|(number, verify)| flag(&format!("verify without a test in task {number}"), verify))
        .collect();
    expected.push(flag(
        "verify without a test in the proposal",
        "node other.mjs",
    ));
    assert_eq!(flag_lines(&root), expected);
}
