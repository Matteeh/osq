//! Proves the executor prompt matches TypeScript's, byte for byte.

use std::fs;
use std::path::{Path, PathBuf};

use osq_feature_run::{PriorAttempt, executor_prompt};
use osq_kernel_specs::read_task_file;

/// One row of the executor prompt golden table.
struct PromptRow {
    /// The golden file's name.
    golden: &'static str,
    /// The change folder under `openspec/changes`.
    change: &'static str,
    /// The task number.
    task: &'static str,
    /// The execution attempt.
    attempt: u32,
    /// The prior failure reason, when the row has one.
    reason: Option<&'static str>,
    /// The prior failure output, when the row has one.
    output: Option<&'static str>,
    /// Whether the row writes the task's result file.
    result: bool,
}

/// The five rows of "Executor prompts equal TypeScript's".
const PROMPT_ROWS: [PromptRow; 5] = [
    PromptRow {
        golden: "sample-1-first.txt",
        change: "001-sample",
        task: "1",
        attempt: 1,
        reason: None,
        output: None,
        result: false,
    },
    PromptRow {
        golden: "sample-2-retry.txt",
        change: "001-sample",
        task: "2",
        attempt: 3,
        reason: Some("verify_red"),
        output: Some("<long>"),
        result: true,
    },
    PromptRow {
        golden: "sample-1-blank-output.txt",
        change: "001-sample",
        task: "1",
        attempt: 2,
        reason: None,
        output: Some("  \n\t"),
        result: false,
    },
    PromptRow {
        golden: "bare-1-result.txt",
        change: "002-bare",
        task: "1",
        attempt: 1,
        reason: None,
        output: None,
        result: true,
    },
    PromptRow {
        golden: "bare-1-short-output.txt",
        change: "002-bare",
        task: "1",
        attempt: 2,
        reason: Some("change_verify_red"),
        output: Some("error: one\nerror: two"),
        result: false,
    },
];

/// The earlier result file the result rows write.
const RESULT: &str = "## Changed\n\n- Earlier attempt.\n\nTouched: none\n";

/// The sentinel a row uses for the 120-line long output.
const LONG: &str = "<long>";

/// The run crate's test fixtures folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// Creates a fresh copy of the prompt fixture under `CARGO_TARGET_TMPDIR`.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    copy_tree(&fixtures().join("prompt-project"), &root);
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

/// Writes one file under a base folder, creating its parent folders.
fn write_file(base: &Path, relative: &str, text: &str) {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// The long prior output of the retry row.
fn long_output() -> String {
    (1..=120)
        .map(|index| format!("line {index}: é verify failed"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Builds the prompt for one row of "Executor prompts equal TypeScript's".
fn prompt_for(
    root: &Path,
    change: &str,
    task: &str,
    attempt: u32,
    reason: Option<&str>,
    output: Option<&str>,
    result: bool,
) -> String {
    let folder = root.join("openspec").join("changes").join(change);
    if result {
        write_file(&folder, &format!(".run/results/{task}.md"), RESULT);
    }
    let prior = PriorAttempt {
        attempt,
        reason: reason.map(str::to_owned),
        output: output.map(|text| {
            if text == LONG {
                long_output()
            } else {
                text.to_owned()
            }
        }),
    };
    executor_prompt(root, &folder, task, &prior).expect("the row's prompt builds")
}

/// The lines after a `- ` list heading, up to the next blank line.
fn entries(prompt: &str, heading: &str) -> Vec<String> {
    let marker = format!("\n{heading}\n");
    let Some(start) = prompt.find(&marker) else {
        return Vec::new();
    };
    prompt[start + marker.len()..]
        .lines()
        .take_while(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The `Prior Context:` line and everything up to the next blank line.
fn context_lines(prompt: &str) -> Vec<String> {
    let marker = "\nPrior Context:\n";
    let Some(start) = prompt.find(marker) else {
        return Vec::new();
    };
    prompt[start + 1..]
        .lines()
        .take_while(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The kept text after `- Prior Failure Output:`.
fn kept_output(prompt: &str) -> Vec<String> {
    let lines = context_lines(prompt);
    let start = lines
        .iter()
        .position(|line| line == "- Prior Failure Output:")
        .expect("the output heading is present");
    lines[start + 1..]
        .iter()
        .map(|line| {
            line.strip_prefix("  ")
                .expect("the line is indented")
                .to_owned()
        })
        .collect()
}

/// Proves every row of "Executor prompts equal TypeScript's".
///
/// Covers: rust-run/executor-prompts-equal-typescript-s
#[test]
fn executor_prompts_equal_typescript() {
    for row in &PROMPT_ROWS {
        let root = scratch(&format!("executor_prompt/{}", row.golden));
        let prompt = prompt_for(
            &root,
            row.change,
            row.task,
            row.attempt,
            row.reason,
            row.output,
            row.result,
        );
        let golden = fs::read_to_string(fixtures().join("prompt-golden").join(row.golden))
            .expect("the golden reads");
        assert_eq!(prompt, golden, "{}", row.golden);
    }
}

/// Proves a missing task file gives `read_task_file`'s error.
///
/// Covers: rust-run/missing-task-file
#[test]
fn missing_task_file() {
    let root = scratch("executor_prompt/missing_task_file");
    let folder = root.join("openspec").join("changes").join("001-sample");
    let expected =
        read_task_file(&folder.join("tasks").join("9.md")).expect_err("the task file is missing");
    let error = executor_prompt(&root, &folder, "9", &PriorAttempt::default())
        .expect_err("the missing task fails");
    assert_eq!(error, expected);
}

/// Proves the spec lists of the prompt fixture.
///
/// Covers: rust-run/spec-lists-of-the-prompt-fixture
#[test]
fn spec_lists_of_the_prompt_fixture() {
    let sample = scratch("executor_prompt/spec_lists_sample");
    let prompt = prompt_for(&sample, "001-sample", "1", 1, None, None, false);
    assert_eq!(
        entries(&prompt, "Delta Specs:"),
        vec![
            "- openspec/changes/001-sample/specs/alpha/spec.md".to_owned(),
            "- openspec/changes/001-sample/specs/zeta/spec.md".to_owned(),
        ]
    );
    assert_eq!(
        entries(&prompt, "Living Capability Specs:"),
        vec![
            "- openspec/specs/alpha/spec.md".to_owned(),
            "- openspec/specs/beta/spec.md".to_owned(),
        ]
    );

    let bare = scratch("executor_prompt/spec_lists_bare");
    let prompt = prompt_for(&bare, "002-bare", "1", 1, None, None, false);
    assert!(!prompt.contains("Delta Specs:"), "no delta section");
    assert!(
        !prompt.contains("Living Capability Specs:"),
        "no living section"
    );
}

/// Proves the capability rules of the prompt fixture.
///
/// Covers: rust-run/capability-rules-of-the-prompt-fixture
#[test]
fn capability_rules_of_the_prompt_fixture() {
    let root = scratch("executor_prompt/capability_rules");
    let prompt = prompt_for(&root, "001-sample", "1", 1, None, None, false);
    let expected = [
        "- alpha: New rule — The alpha capability SHALL do the new thing across lines.",
        "- alpha: Bare rule",
        "- alpha: Changed rule — The alpha capability SHALL do the new thing instead.",
        "- alpha: Old rule — **Reason**: New rule replaces it. **Migration**: Use New rule.",
        "- zeta: Code ownership — The zeta capability SHALL own the `zeta` crate.",
    ];
    assert_eq!(entries(&prompt, "Capability Rules:"), expected);
}

/// Creates a fresh fixture copy with a `003-rules` change holding `spec`.
fn rules_root(name: &str, spec: &str) -> (PathBuf, PathBuf) {
    let root = scratch(name);
    let change = root.join("openspec").join("changes").join("003-rules");
    write_file(
        &change,
        "proposal.md",
        "---\ntitle: Rules\ndepends_on: []\nverify: node verify.cjs\n---\n## Goal\n\nRules.\n",
    );
    write_file(
        &change,
        "tasks/1.md",
        "---\ntitle: When rules are built\nverify: node verify.cjs\nscope: []\nentry: []\n---\n## Acceptance\n\n- [ ] Rules exist.\n",
    );
    write_file(&change, "specs/alpha/spec.md", spec);
    (root, change)
}

/// Proves the statements the requirement parser gives each row.
///
/// Covers: rust-run/requirement-statements
#[test]
fn requirement_statements() {
    let rows = [
        (
            "\n<!-- source: a/** -->\nThe rule SHALL do\nthe thing   across\tlines.\n\n#### Scenario: S\n- x",
            "The rule SHALL do the thing across lines.",
        ),
        ("\n#### Scenario: S\n- x", ""),
        (
            "\nFirst <!-- a\nb --> part.\n\n## REMOVED Requirements",
            "First part.",
        ),
        ("\nOne\u{a0}two\u{feff}three", "One two three"),
        ("\nOne\n##Tight\nTwo", "One ##Tight Two"),
        ("\nOne\n###Tight\nTwo", "One ###Tight Two"),
        ("\nOne\n####Scenario: S\nTwo", "One ####Scenario: S Two"),
    ];
    for (index, (requirement, statement)) in rows.iter().enumerate() {
        let (root, change) = rules_root(
            &format!("executor_prompt/statement_{index}"),
            &format!(
                "## ADDED Requirements\n\n###Requirement: Not a header\n\n### Requirement: New rule{requirement}\n"
            ),
        );
        let prompt = executor_prompt(&root, &change, "1", &PriorAttempt::default())
            .expect("the row's prompt builds");
        let expected = if statement.is_empty() {
            "- alpha: New rule".to_owned()
        } else {
            format!("- alpha: New rule — {statement}")
        };
        assert_eq!(entries(&prompt, "Capability Rules:"), vec![expected]);
    }
}

/// Proves requirements with no scenario stay separate blocks.
///
/// Covers: rust-run/requirement-statements
#[test]
fn requirement_blocks() {
    let (root, change) = rules_root(
        "executor_prompt/requirement_blocks",
        "## ADDED Requirements\n\n### Requirement: First rule\nOne\n### Requirement: Second rule\nTwo\n",
    );
    let prompt = executor_prompt(&root, &change, "1", &PriorAttempt::default())
        .expect("the blocks' prompt builds");
    assert_eq!(
        entries(&prompt, "Capability Rules:"),
        vec![
            "- alpha: First rule — One".to_owned(),
            "- alpha: Second rule — Two".to_owned(),
        ]
    );
}

/// One row of the prior context table.
struct PriorRow {
    /// The scratch folder's suffix and assertion label.
    name: &'static str,
    /// The change folder under `openspec/changes`.
    change: &'static str,
    /// The task number.
    task: &'static str,
    /// The execution attempt.
    attempt: u32,
    /// The prior failure reason, when the row has one.
    reason: Option<&'static str>,
    /// The prior failure output, when the row has one.
    output: Option<&'static str>,
    /// Whether the row writes the task's result file.
    result: bool,
    /// The prior context lines the prompt holds.
    expected: Vec<&'static str>,
}

/// Proves the prior context lines of the prompt fixture.
///
/// Covers: rust-run/prior-context-of-the-prompt-fixture
#[test]
fn prior_context_of_the_prompt_fixture() {
    let rows = [
        PriorRow {
            name: "first",
            change: "001-sample",
            task: "1",
            attempt: 1,
            reason: None,
            output: None,
            result: false,
            expected: vec![],
        },
        PriorRow {
            name: "blank_output",
            change: "001-sample",
            task: "1",
            attempt: 2,
            reason: None,
            output: Some("  \n\t"),
            result: false,
            expected: vec!["Prior Context:", "- Prior Attempt: 2"],
        },
        PriorRow {
            name: "bare_result",
            change: "002-bare",
            task: "1",
            attempt: 1,
            reason: None,
            output: None,
            result: true,
            expected: vec![
                "Prior Context:",
                "- Prior Attempt: 1",
                "- Prior Result: openspec/changes/002-bare/.run/results/1.md",
            ],
        },
        PriorRow {
            name: "short_output",
            change: "002-bare",
            task: "1",
            attempt: 2,
            reason: Some("change_verify_red"),
            output: Some("error: one\nerror: two"),
            result: false,
            expected: vec![
                "Prior Context:",
                "- Prior Attempt: 2",
                "- Prior Failure: change_verify_red",
                "- Prior Failure Output:",
                "  error: one",
                "  error: two",
            ],
        },
    ];
    for row in rows {
        let root = scratch(&format!("executor_prompt/prior_{}", row.name));
        let prompt = prompt_for(
            &root,
            row.change,
            row.task,
            row.attempt,
            row.reason,
            row.output,
            row.result,
        );
        assert_eq!(context_lines(&prompt), row.expected, "{}", row.name);
    }
}

/// Proves the prior failure output bound.
///
/// Covers: rust-run/output-bounds
#[test]
fn output_bounds() {
    let long = "a".repeat(2000);
    let rows = [
        (long.clone(), long.clone()),
        (format!("{long}a"), format!("{long}…")),
        ("a".repeat(1999) + "é", "a".repeat(1999) + "é"),
        ("a".repeat(1999) + "é" + "b", "a".repeat(1999) + "é…"),
    ];
    for (index, (output, expected)) in rows.iter().enumerate() {
        let root = scratch(&format!("executor_prompt/output_bound_{index}"));
        let prompt = prompt_for(&root, "002-bare", "1", 2, None, Some(output), false);
        assert_eq!(kept_output(&prompt), vec![expected.clone()]);
    }
}
