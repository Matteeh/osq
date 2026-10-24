//! Proves the argument combinations TypeScript refuses.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_plan::PlanFeature;

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Runs `plan` with the given arguments.
fn run_plan(root: &Path, args: &[&str]) -> Result<(), FeatureError> {
    PlanFeature::new()
        .run(&Invocation::new(
            root,
            "plan",
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        ))
        .map(|_| ())
}

/// Proves every row of "TypeScript argument refusals".
///
/// Covers: rust-plan/typescript-argument-refusals
#[test]
fn typescript_argument_refusals() {
    let cases: [(&str, &[&str], &str); 9] = [
        (
            "notes",
            &["x", "--notes", "hi"],
            "`--notes` is valid only with `--run`",
        ),
        (
            "notes after flags",
            &["x", "-p", "--brief", "b.md", "--notes", "hi"],
            "`--notes` is valid only with `--run`",
        ),
        (
            "next with name",
            &["x", "--next"],
            "`plan --next` cannot be combined with a change name",
        ),
        (
            "next with brief",
            &["--next", "--brief", "b.md"],
            "`plan --next` cannot be combined with --brief",
        ),
        (
            "replan alone",
            &["--replan"],
            "`--replan` is valid only with `plan --next`",
        ),
        (
            "name with replan",
            &["x", "--replan"],
            "`--replan` is valid only with `plan --next`",
        ),
        (
            "no arguments",
            &[],
            "Provide a change name or use `plan --next`",
        ),
        (
            "blank name",
            &["  "],
            "Provide a change name or use `plan --next`",
        ),
        (
            "print only",
            &["--print"],
            "Provide a change name or use `plan --next`",
        ),
    ];
    for (name, args, expected) in cases {
        let root = scratch(&format!(
            "typescript_argument_refusals/{}",
            name.replace(' ', "_")
        ));
        match run_plan(&root, args) {
            Err(FeatureError::Usage {
                command, message, ..
            }) => assert_eq!(
                (command.as_str(), message.as_str()),
                ("plan", expected),
                "row {name}"
            ),
            other => panic!("row {name} expects a Usage error, got {other:?}"),
        }
        assert!(!root.join("openspec").exists(), "row {name} reads no file");
    }
}
