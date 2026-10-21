//! Proves the new change folder's number, proposal, brief date and handoff.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// The one-item queue most rows use.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The item's hash for [`QUEUE`].
const HASH: &str = "sha256:9056fb796a9a448d47d3fcb403b7de7740061122ebec1824e7d739b4535dd8d5";

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file under a base folder, creating its parent folders.
fn write(base: &Path, relative: &str, text: &str) {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Writes the repository's `openspec/queue.md`.
fn write_queue(root: &Path, text: &str) {
    write(root, "openspec/queue.md", text);
}

/// Creates one folder under the changes folder.
fn directory(root: &Path, name: &str) {
    fs::create_dir_all(root.join("openspec").join("changes").join(name))
        .expect("the change folder is created");
}

/// Creates a folder with a brief naming one queue item.
fn briefed(root: &Path, name: &str, item: &str) {
    let folder = root.join("openspec").join("changes").join(name);
    fs::create_dir_all(&folder).expect("the change folder is created");
    write(
        &folder,
        "brief.md",
        &format!("---\nqueue_item: {item}\n---\n\nA brief.\n"),
    );
}

/// Runs `plan --next` at a fixed time.
fn run_plan_at(root: &Path, now_ms: i64) -> Result<Output, FeatureError> {
    PlanFeature::at(now_ms).run(&Invocation::new(root, "plan", vec!["--next".to_owned()]))
}

/// The system clock in epoch milliseconds.
fn system_now_ms() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    i64::try_from(millis).unwrap_or_default()
}

/// Builds no entries.
fn no_entries(_root: &Path) {}

/// Builds active, archived and rejected entries.
fn all_locations(root: &Path) {
    directory(root, "007-x");
    directory(root, "archive/012-y");
    directory(root, "rejected/030-z");
}

/// Builds an active entry whose name has no digits.
fn text_entry(root: &Path) {
    directory(root, "x-y");
}

/// Builds an active entry with four digits.
fn large_entry(root: &Path) {
    directory(root, "0999-x");
}

/// Builds a file entry with a number.
fn file_entry(root: &Path) {
    write(root, "openspec/changes/041-notes.md", "notes\n");
}

/// Proves every row of "Next change numbers".
///
/// Covers: rust-plan/next-change-numbers
#[test]
fn next_change_numbers() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, &str); 5] = [
        ("missing changes folder", no_entries, "001-a"),
        ("all three locations", all_locations, "031-a"),
        ("text entry", text_entry, "001-a"),
        ("four digit entry", large_entry, "1000-a"),
        ("file entry", file_entry, "042-a"),
    ];
    for (name, setup, expected) in rows {
        let root = scratch(&format!("next_change_numbers/{}", name.replace(' ', "_")));
        write_queue(&root, QUEUE);
        setup(&root);
        run_plan_at(&root, 0).unwrap_or_else(|error| panic!("row {name}: {error}"));
        assert!(
            root.join("openspec")
                .join("changes")
                .join(expected)
                .is_dir(),
            "row {name} creates {expected}"
        );
    }
}

/// One "Seeded proposal lines" row: its name, queue, archived folders and lines.
type SeededRow = (
    &'static str,
    &'static str,
    &'static [(&'static str, &'static str)],
    &'static str,
);

/// Proves every row of "Seeded proposal lines".
///
/// Covers: rust-plan/seeded-proposal-lines
#[test]
fn seeded_proposal_lines() {
    let rows: [SeededRow; 4] = [
        (
            "single item",
            "## [a] A\n\nDepends on: nothing\n\nA.\n",
            &[],
            "title: A\ndepends_on: []\nverify: node -e \"process.exit(0)\"\nfeatures:",
        ),
        (
            "landed dependency",
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: a\n\nB.\n",
            &[("archive/001-a", "a")],
            "title: B\ndepends_on: [\"001\"]\nverify: node -e \"process.exit(0)\"\nfeatures:",
        ),
        (
            "fix only",
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\nFixes: a\n\nB.\n",
            &[("archive/001-a", "a")],
            "title: B\ndepends_on: []\nfixes: [\"001\"]\nverify: node -e \"process.exit(0)\"",
        ),
        (
            "two dependencies and a fix",
            "## [a] A\n\nDepends on: nothing\n\nA.\n\n## [b] B\n\nDepends on: nothing\n\nB.\n\n## [c] C\n\nDepends on: a, b\nFixes: b\n\nC.\n",
            &[("archive/003-a", "a"), ("archive/001-b", "b")],
            "title: C\ndepends_on: [\"003\", \"001\"]\nfixes: [\"001\"]\nverify: node -e \"process.exit(0)\"",
        ),
    ];
    for (name, queue, archived, expected) in rows {
        let root = scratch(&format!("seeded_proposal_lines/{}", name.replace(' ', "_")));
        write_queue(&root, queue);
        for (folder, item) in archived {
            briefed(&root, folder, item);
        }
        run_plan_at(&root, 0).unwrap_or_else(|error| panic!("row {name}: {error}"));
        let changes = root.join("openspec").join("changes");
        let created = fs::read_dir(&changes)
            .expect("the changes folder reads")
            .flatten()
            .find(|entry| {
                let name = entry.file_name();
                entry.file_type().is_ok_and(|kind| kind.is_dir())
                    && name != "archive"
                    && name != "rejected"
            })
            .expect("the new change folder exists");
        let proposal =
            fs::read_to_string(created.path().join("proposal.md")).expect("the proposal reads");
        let lines = proposal
            .lines()
            .skip(1)
            .take(4)
            .collect::<Vec<_>>()
            .join("\n");
        assert_eq!(lines, expected, "row {name}");
    }
}

/// Proves every row of "Brief dates".
///
/// Covers: rust-plan/brief-dates
#[test]
fn brief_dates() {
    let rows: [(i64, &str); 8] = [
        (0, "1970-01-01"),
        (946_684_799_999, "1999-12-31"),
        (951_782_400_000, "2000-02-29"),
        (951_868_799_999, "2000-02-29"),
        (1_709_251_199_999, "2024-02-29"),
        (1_792_584_000_000, "2026-10-21"),
        (4_107_542_399_999, "2100-02-28"),
        (4_107_542_400_000, "2100-03-01"),
    ];
    for (time, date) in rows {
        let root = scratch(&format!("brief_dates/{time}"));
        write_queue(&root, QUEUE);
        run_plan_at(&root, time).unwrap_or_else(|error| panic!("row {time}: {error}"));
        let brief = fs::read_to_string(
            root.join("openspec")
                .join("changes")
                .join("001-a")
                .join("brief.md"),
        )
        .expect("the brief reads");
        let expected = format!(
            "---\nqueue_item: a\nqueue_hash: {HASH}\nplanner: null\ndate: {date}\n---\n\nA.\n"
        );
        assert_eq!(brief, expected, "row {time}");
    }
}

/// Proves "Brief date from the system clock".
///
/// Covers: rust-plan/brief-date-from-the-system-clock
#[test]
fn brief_date_from_the_system_clock() {
    let root = scratch("brief_date_from_the_system_clock/run");
    write_queue(&root, QUEUE);
    let before = system_now_ms();
    PlanFeature::new()
        .run(&Invocation::new(&root, "plan", vec!["--next".to_owned()]))
        .expect("the system-clock run succeeds");
    let after = system_now_ms();
    let brief = fs::read_to_string(
        root.join("openspec")
            .join("changes")
            .join("001-a")
            .join("brief.md"),
    )
    .expect("the brief reads");
    for (name, time) in [("before", before), ("after", after)] {
        let expected_root = scratch(&format!("brief_date_from_the_system_clock/{name}"));
        write_queue(&expected_root, QUEUE);
        run_plan_at(&expected_root, time).unwrap_or_else(|error| panic!("row {name}: {error}"));
        let expected = fs::read_to_string(
            expected_root
                .join("openspec")
                .join("changes")
                .join("001-a")
                .join("brief.md"),
        )
        .expect("the fixed brief reads");
        assert_eq!(brief, expected, "row {name}");
    }
}

/// Builds no Claude command.
fn no_command(_root: &Path) {}

/// Builds the Claude command as a file.
fn command_file(root: &Path) {
    write(root, ".claude/commands/osq-plan.md", "command\n");
}

/// Builds the Claude command path as a folder.
fn command_folder(root: &Path) {
    fs::create_dir_all(root.join(".claude").join("commands").join("osq-plan.md"))
        .expect("the command folder is created");
}

/// Proves every row of "Handoff text".
///
/// Covers: rust-plan/handoff-text
#[test]
fn handoff_text() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, &str); 3] = [
        ("no command", no_command, ""),
        (
            "command file",
            command_file,
            "\nIn Claude Code, /osq-plan 001 does the same.\n",
        ),
        ("command folder", command_folder, ""),
    ];
    for (name, setup, suffix) in rows {
        let root = scratch(&format!("handoff_text/{}", name.replace(' ', "_")));
        write_queue(&root, QUEUE);
        setup(&root);
        let output = run_plan_at(&root, 0).unwrap_or_else(|error| panic!("row {name}: {error}"));
        let path = root.join("openspec").join("changes").join("001-a");
        let expected = format!(
            "{}: ask your planning tool to plan change 001-a \u{2014} next: unplanned \u{2014} osq plan 001\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change 001-a.\nRead {}/plan-prompt.md and follow it exactly; it is your complete prompt.\n{suffix}",
            path.display(),
            path.display()
        );
        assert_eq!(output.text, expected, "row {name}");
    }
}
