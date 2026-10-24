//! Proves the `brief.md` text `plan <name> --brief` writes.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The fixed time whose UTC date the brief rows record.
const TIME: i64 = 1_792_843_200_000;

/// Creates a scratch root for one test row, removing any left-over folder.
fn scratch(row: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("plan_brief_texts")
        .join(row);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Runs `plan x --brief b.md` on a root whose `b.md` holds `brief`.
fn run_plan(root: &Path, brief: &str) {
    fs::write(root.join("b.md"), brief).expect("the brief is written");
    PlanFeature::at(TIME)
        .run(&Invocation::new(
            root,
            "plan",
            ["x", "--brief", "b.md"]
                .iter()
                .map(|arg| (*arg).to_owned())
                .collect(),
        ))
        .expect("the plan succeeds");
}

/// Proves every row of "Brief texts".
///
/// Covers: rust-plan/brief-texts
#[test]
fn brief_texts() {
    let rows: [(&str, &str, &str); 4] = [
        (
            "plain",
            "Do the thing.\n",
            "---\nplanner: null\ndate: 2026-10-24\n---\n\nDo the thing.\n",
        ),
        (
            "values",
            "---\nn: 007\nok: yes\nt: true\nz: ~\nf: 1.50\n---\nB\n",
            "---\nn: 7\nok: yes\nt: true\nz: null\nf: 1.5\nplanner: null\ndate: 2026-10-24\n---\n\nB\n",
        ),
        (
            "given keys",
            "---\nplanner: me\ndate: 2020-01-01\nowner: x\n---\n\n  Body.  \n\n",
            "---\nplanner: null\ndate: 2026-10-24\nowner: x\n---\n\nBody.\n",
        ),
        (
            "bad frontmatter",
            "---\n: bad: [\n---\nB\n",
            "---\nplanner: null\ndate: 2026-10-24\n---\n\n---\n: bad: [\n---\nB\n",
        ),
    ];
    for (name, brief, expected) in rows {
        let root = scratch(name);
        run_plan(&root, brief);
        let written = fs::read_to_string(root.join("openspec/changes/001-x/brief.md"))
            .expect("the brief reads");
        assert_eq!(written, expected, "row {name}");
    }
}
