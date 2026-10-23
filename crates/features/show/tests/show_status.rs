//! Proves the show status line, next line and first task line.

use std::fs;
use std::path::Path;

use osq_core::{Feature, Invocation};
use osq_feature_show::ShowFeature;

/// The verify line every status row starts its proposal with.
const VERIFY: &str = "verify: node --test tests/a.test.ts\n";
/// A proposal verify followed by a dependency on `002`.
const DEPENDS_002: &str = "verify: node --test tests/a.test.ts\ndepends_on: [\"002\"]\n";
/// A proposal verify followed by a numeric dependency on `2`.
const DEPENDS_2: &str = "verify: node --test tests/a.test.ts\ndepends_on: [2]\n";
/// The single task file every status row writes.
const TASK: &str = "---\ntitle: When a runs, it works\nverify: node --test tests/a.test.ts\nscope:\n  - src/a.ts\n---\n## Acceptance\n\n- [ ] A works.\n";

/// One status row: its name, proposal frontmatter, other files and expected lines.
struct Row<'a> {
    /// The row's name.
    name: &'a str,
    /// The proposal frontmatter after its title.
    front: &'a str,
    /// Files under the change folder, or relative to it.
    files: &'a [(&'a str, &'a str)],
    /// The expected trimmed `Status:` line.
    status: &'a str,
    /// The expected trimmed `Next:` line.
    next: &'a str,
    /// The expected trimmed first task line.
    task: &'a str,
}

/// Writes a proposal with a title, the given frontmatter and empty features.
fn proposal(extra: &str) -> String {
    format!(
        "---\ntitle: A works\n{extra}features:\n  reads: []\n---\n## Goal\n\nA works.\n\n## Human steps\n\n### Before approval\n\nNone\n\n### After landing\n\nNone\n"
    )
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs one row on its own scratch root and returns its three inspected lines.
fn inspect(index: usize, row: &Row<'_>) -> (String, String, String) {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("show-status-{index}"));
    let _ = fs::remove_dir_all(&root);
    let folder = root.join("openspec/changes/001-a");
    write(&folder.join("proposal.md"), &proposal(row.front));
    write(&folder.join("tasks/1.md"), TASK);
    for (relative, text) in row.files {
        write(&folder.join(relative), text);
    }
    let output = ShowFeature
        .run(&Invocation::new(&root, "show", vec!["1".to_owned()]))
        .expect("the row is shown")
        .text;
    lines(&output, row.name)
}

/// The trimmed status, next and first task lines of one output.
fn lines(output: &str, name: &str) -> (String, String, String) {
    let all: Vec<&str> = output.lines().collect();
    let status = all
        .iter()
        .find(|line| line.starts_with("Status: "))
        .unwrap_or_else(|| panic!("{name}: no status line"));
    let next = all
        .iter()
        .find(|line| line.starts_with("Next: "))
        .unwrap_or_else(|| panic!("{name}: no next line"));
    let task = all
        .iter()
        .find(|line| line.starts_with("  ["))
        .unwrap_or_else(|| panic!("{name}: no task line"));
    (
        status.trim().to_owned(),
        next.trim().to_owned(),
        task.trim().to_owned(),
    )
}

/// The status-table rows of "Status and next step from markers".
const STATUS_ROWS: &[Row<'_>] = &[
    Row {
        name: "unapproved",
        front: VERIFY,
        files: &[],
        status: "Status: [unapproved]",
        next: "Next: ready for approval — osq approve 001",
        task: "[ ] 1. When a runs, it works [pending]",
    },
    Row {
        name: "unapproved, no verify",
        front: "",
        files: &[],
        status: "Status: [unapproved]",
        next: "Next: unplanned — osq lint 001",
        task: "[ ] 1. When a runs, it works [pending]",
    },
    Row {
        name: "unapproved, sentinel verify",
        front: "verify: node -e \"process.exit(0)\"\n",
        files: &[],
        status: "Status: [unapproved]",
        next: "Next: unplanned — osq lint 001",
        task: "[ ] 1. When a runs, it works [pending]",
    },
    Row {
        name: "unapproved, sentinel verify, brief",
        front: "verify: node -e \"process.exit(0)\"\n",
        files: &[("brief.md", "x\n")],
        status: "Status: [unapproved]",
        next: "Next: unplanned — osq plan 001",
        task: "[ ] 1. When a runs, it works [pending]",
    },
    Row {
        name: "approved",
        front: VERIFY,
        files: &[(".run/approved", "sha\n")],
        status: "Status: [pending]",
        next: "Next: running — osq show 001",
        task: "[ ] 1. When a runs, it works [pending]",
    },
    Row {
        name: "approved, done 1",
        front: VERIFY,
        files: &[(".run/approved", "sha\n"), (".run/done/1", "")],
        status: "Status: [done]",
        next: "Next: running — osq show 001",
        task: "[x] 1. When a runs, it works [done]",
    },
    Row {
        name: "approved, running 1",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/running/1.pid", "{\"pid\":1,\"startedAt\":2}\n"),
        ],
        status: "Status: [running]",
        next: "Next: running — osq show 001",
        task: "[>] 1. When a runs, it works [running]",
    },
    Row {
        name: "dead verify_red",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/dead/1.md", "---\nreason: verify_red\n---\n"),
        ],
        status: "Status: [dead]",
        next: "Next: dead — osq retry 001 1",
        task: "[!] 1. When a runs, it works [dead] (reason: verify_red)",
    },
    Row {
        name: "dead blocked",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/dead/1.md", "---\nreason: blocked\n---\n"),
        ],
        status: "Status: [dead]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[!] 1. When a runs, it works [dead] (reason: blocked)",
    },
    Row {
        name: "dead entry_missing",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/dead/1.md", "---\nreason: entry_missing\n---\n"),
        ],
        status: "Status: [dead]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[!] 1. When a runs, it works [dead] (reason: entry_missing)",
    },
    Row {
        name: "dead stuck",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (
                ".run/dead/1.md",
                "---\nreason: crashed\nstuck: true\nfingerprint: f\n---\n",
            ),
        ],
        status: "Status: [dead]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[!] 1. When a runs, it works [dead] (reason: crashed)",
    },
    Row {
        name: "dead blocked, done 1",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/dead/1.md", "---\nreason: blocked\n---\n"),
            (".run/done/1", ""),
        ],
        status: "Status: [dead]",
        next: "Next: running — osq show 001",
        task: "[!] 1. When a runs, it works [dead] (reason: blocked)",
    },
    Row {
        name: "regressed 1 scope_regression passed",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (
                ".run/regressed/1.md",
                "---\nreason: scope_regression\nverification_passed: true\n---\n",
            ),
        ],
        status: "Status: [regressed]",
        next: "Next: dead — osq retry 001 1",
        task: "[ ] 1. When a runs, it works [regressed]",
    },
    Row {
        name: "regressed 1 scope_regression",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (
                ".run/regressed/1.md",
                "---\nreason: scope_regression\n---\n",
            ),
        ],
        status: "Status: [regressed]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[ ] 1. When a runs, it works [regressed]",
    },
    Row {
        name: "regressed change sync_conflict",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (
                ".run/regressed/change.md",
                "---\nreason: sync_conflict\n---\n",
            ),
        ],
        status: "Status: [done]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[x] 1. When a runs, it works [done]",
    },
    Row {
        name: "regressed change requirement_changed",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (
                ".run/regressed/change.md",
                "---\nreason: requirement_changed\n---\n",
            ),
        ],
        status: "Status: [done]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[x] 1. When a runs, it works [done]",
    },
    Row {
        name: "regressed change verify_red",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (".run/regressed/change.md", "---\nreason: verify_red\n---\n"),
        ],
        status: "Status: [done]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[x] 1. When a runs, it works [done]",
    },
    Row {
        name: "regressed change verify_path_missing",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (
                ".run/regressed/change.md",
                "---\nreason: verify_path_missing\n---\n",
            ),
        ],
        status: "Status: [done]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[x] 1. When a runs, it works [done]",
    },
    Row {
        name: "regressed change sync_verify_red",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (
                ".run/regressed/change.md",
                "---\nreason: sync_verify_red\n---\n",
            ),
        ],
        status: "Status: [done]",
        next: "Next: dead (needs steering) — osq plan 001",
        task: "[x] 1. When a runs, it works [done]",
    },
    Row {
        name: "regressed change other",
        front: VERIFY,
        files: &[
            (".run/approved", "sha\n"),
            (".run/done/1", ""),
            (".run/regressed/change.md", "---\nreason: other\n---\n"),
        ],
        status: "Status: [done]",
        next: "Next: dead — osq retry 001 change",
        task: "[x] 1. When a runs, it works [done]",
    },
];

/// Proves every status-table row of "Status and next step from markers".
///
/// Covers: rust-show/status-and-next-step-from-markers
#[test]
fn status_and_next_step_from_markers() {
    for (index, row) in STATUS_ROWS.iter().enumerate() {
        let (status, next, task) = inspect(index, row);
        assert_eq!(status, row.status, "{} status", row.name);
        assert_eq!(next, row.next, "{} next", row.name);
        assert_eq!(task, row.task, "{} task", row.name);
    }
}

/// Proves every dependency-readiness row of "Dependency readiness from folders".
///
/// Covers: rust-show/dependency-readiness-from-folders
#[test]
fn dependency_readiness_from_folders() {
    let proposal_for_dependency = proposal(VERIFY);
    let rows: &[Row<'_>] = &[
        Row {
            name: "depends 002 missing",
            front: DEPENDS_002,
            files: &[(".run/approved", "sha\n")],
            status: "Status: [blocked]",
            next: "Next: blocked (waiting for 002) — osq show 002",
            task: "[ ] 1. When a runs, it works [pending]",
        },
        Row {
            name: "depends 2 archived",
            front: DEPENDS_2,
            files: &[
                (".run/approved", "sha\n"),
                ("../archive/002-b/tasks/1.md", TASK),
            ],
            status: "Status: [pending]",
            next: "Next: running — osq show 001",
            task: "[ ] 1. When a runs, it works [pending]",
        },
        Row {
            name: "depends 002 rejected",
            front: DEPENDS_002,
            files: &[
                (".run/approved", "sha\n"),
                ("../rejected/002-b/tasks/1.md", TASK),
            ],
            status: "Status: [blocked]",
            next: "Next: blocked (waiting for 002) — osq show 002",
            task: "[ ] 1. When a runs, it works [pending]",
        },
        Row {
            name: "depends 002 active unfinished",
            front: DEPENDS_002,
            files: &[
                (".run/approved", "sha\n"),
                ("../002-b/proposal.md", &proposal_for_dependency),
                ("../002-b/tasks/1.md", TASK),
            ],
            status: "Status: [blocked]",
            next: "Next: blocked (waiting for 002) — osq show 002",
            task: "[ ] 1. When a runs, it works [pending]",
        },
        Row {
            name: "depends 002 active done",
            front: DEPENDS_002,
            files: &[
                (".run/approved", "sha\n"),
                ("../002-b/proposal.md", &proposal_for_dependency),
                ("../002-b/tasks/1.md", TASK),
                ("../002-b/.run/done/1", ""),
            ],
            status: "Status: [pending]",
            next: "Next: running — osq show 001",
            task: "[ ] 1. When a runs, it works [pending]",
        },
        Row {
            name: "depends 002 active no tasks",
            front: DEPENDS_002,
            files: &[
                (".run/approved", "sha\n"),
                ("../002-b/proposal.md", &proposal_for_dependency),
            ],
            status: "Status: [blocked]",
            next: "Next: blocked (waiting for 002) — osq show 002",
            task: "[ ] 1. When a runs, it works [pending]",
        },
    ];
    for (index, row) in rows.iter().enumerate() {
        let (status, next, task) = inspect(index + STATUS_ROWS.len(), row);
        assert_eq!(status, row.status, "{} status", row.name);
        assert_eq!(next, row.next, "{} next", row.name);
        assert_eq!(task, row.task, "{} task", row.name);
    }
}

/// Proves tasks print in numeric order, not byte order.
///
/// Covers: rust-show/status-and-next-step-from-markers
#[test]
fn tasks_print_in_numeric_order() {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("show-status-task-order");
    let _ = fs::remove_dir_all(&root);
    let folder = root.join("openspec/changes/001-a");
    write(&folder.join("proposal.md"), &proposal(VERIFY));
    write(
        &folder.join("tasks/2.md"),
        "---\ntitle: Two\n---\n## Acceptance\n\n- [ ] Two.\n",
    );
    write(
        &folder.join("tasks/10.md"),
        "---\ntitle: Ten\n---\n## Acceptance\n\n- [ ] Ten.\n",
    );
    let output = ShowFeature
        .run(&Invocation::new(&root, "show", vec!["1".to_owned()]))
        .expect("the change is shown")
        .text;
    let task_lines: Vec<&str> = output
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with("[ ] "))
        .collect();
    assert_eq!(task_lines[0], "[ ] 2. Two [pending]");
    assert_eq!(task_lines[1], "[ ] 10. Ten [pending]");
}

/// Proves both placeholder spellings and a real script that is not a placeholder.
///
/// Covers: rust-show/status-and-next-step-from-markers
#[test]
fn placeholder_verify_edges() {
    let eval = "verify: node --eval \"process.exit(0)\"\n";
    let real = "verify: node -e \"console.log(1)\"\n";
    let rows = [
        Row {
            name: "eval placeholder",
            front: eval,
            files: &[],
            status: "Status: [unapproved]",
            next: "Next: unplanned — osq lint 001",
            task: "[ ] 1. When a runs, it works [pending]",
        },
        Row {
            name: "non-placeholder script",
            front: real,
            files: &[],
            status: "Status: [unapproved]",
            next: "Next: ready for approval — osq approve 001",
            task: "[ ] 1. When a runs, it works [pending]",
        },
    ];
    for (index, row) in rows.iter().enumerate() {
        let (status, next, task) = inspect(index + STATUS_ROWS.len() + 10, row);
        assert_eq!(status, row.status, "{} status", row.name);
        assert_eq!(next, row.next, "{} next", row.name);
        assert_eq!(task, row.task, "{} task", row.name);
    }
}

/// Proves every done task still prints the unmet dependency it waits on.
///
/// Covers: rust-show/dependency-readiness-from-folders
#[test]
fn done_tasks_win_over_unmet_dependency() {
    let row = Row {
        name: "depends 002 missing, done 1",
        front: DEPENDS_002,
        files: &[(".run/approved", "sha\n"), (".run/done/1", "")],
        status: "Status: [done]",
        next: "Next: blocked (waiting for 002) — osq show 002",
        task: "[x] 1. When a runs, it works [done]",
    };
    let (status, next, task) = inspect(STATUS_ROWS.len() + 100, &row);
    assert_eq!(status, row.status, "{} status", row.name);
    assert_eq!(next, row.next, "{} next", row.name);
    assert_eq!(task, row.task, "{} task", row.name);
}
