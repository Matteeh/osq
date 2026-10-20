//! Edge cases of reading decisions: membership, dates, sorting and groups.

use osq_kernel_specs::{Adr, AppliesTo, DecisionRecords, read_decisions};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// A fresh temporary project root with an empty `decisions` folder.
fn project(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("specs-decisions")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("decisions")).expect("a decisions folder");
    root
}

/// Writes a file under a project root, creating its parent folders.
fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().expect("a parent")).expect("a parent folder");
    fs::write(path, content).expect("a fixture file");
}

/// Writes bytes under a project root, creating its parent folders.
fn write_bytes(root: &Path, relative: &str, content: &[u8]) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().expect("a parent")).expect("a parent folder");
    fs::write(path, content).expect("a fixture file");
}

/// Reads a temporary project's decisions with its openspec folder.
fn read(root: &Path) -> DecisionRecords {
    read_decisions(root, Path::new("decisions"), Path::new("openspec"))
}

/// Finds one ADR by path.
fn adr<'a>(records: &'a DecisionRecords, path: &str) -> &'a Adr {
    records
        .adrs
        .iter()
        .find(|adr| adr.path == path)
        .unwrap_or_else(|| panic!("no ADR at {path}"))
}

/// Covers: rust-specs/records-of-the-decisions-fixture
#[test]
fn membership_and_status_edges() {
    let root = project("membership");
    write(&root, "decisions/README.md", "---\nstatus: accepted\n---\n");
    write(&root, "decisions/notes.txt", "---\nstatus: accepted\n---\n");
    fs::create_dir_all(root.join("decisions/012-folder")).expect("a decisions folder");
    write(
        &root,
        "decisions/003-no-status.md",
        "---\ntitle: x\n---\n# No status\n",
    );
    write(
        &root,
        "decisions/no-digits.md",
        "---\nstatus: accepted\n---\n# 004. No digits\n",
    );
    write_bytes(&root, "decisions/005-invalid.md", &[0xff, 0xfe]);
    write(&root, "decisions/006-bad-yaml.md", "---\nstatus: [\n---\n");
    write(
        &root,
        "decisions/015-null-status.md",
        "---\nstatus:\n---\n# 015. Null status\n",
    );
    write(
        &root,
        "decisions/016-bool-status.md",
        "---\nstatus: true\n---\n# 016. Bool status\n",
    );
    write(
        &root,
        "decisions/007-int-superseded.md",
        "---\nstatus: superseded\nsuperseded_by: 7\n---\n# 007. Integer\n",
    );
    write(
        &root,
        "decisions/008-title.md",
        "---\nstatus: accepted\n---\n#\n# 008.   The title  \n",
    );

    let records = read(&root);
    let paths: Vec<&str> = records.adrs.iter().map(|adr| adr.path.as_str()).collect();
    assert_eq!(
        vec![
            "decisions/007-int-superseded.md",
            "decisions/008-title.md",
            "decisions/015-null-status.md",
            "decisions/016-bool-status.md",
        ],
        paths
    );
    assert_eq!("", adr(&records, "decisions/015-null-status.md").status);
    assert_eq!("true", adr(&records, "decisions/016-bool-status.md").status);
    assert_eq!(
        Some("7"),
        adr(&records, "decisions/007-int-superseded.md")
            .superseded_by
            .as_deref()
    );
    assert_eq!("The title", adr(&records, "decisions/008-title.md").title);
    assert_eq!(
        vec![
            "decisions/003-no-status.md",
            "decisions/005-invalid.md",
            "decisions/006-bad-yaml.md",
            "decisions/no-digits.md",
        ],
        records.ignored
    );
    assert_eq!(BTreeMap::new(), records.groups);
}

/// Covers: rust-specs/records-of-the-decisions-fixture
#[test]
fn date_edges() {
    let root = project("dates");
    write(
        &root,
        "decisions/001-date-end.md",
        "---\nstatus: proposed\n---\n# 001. End\n\nDate: 2026-12-31",
    );
    write(
        &root,
        "decisions/002-date-short.md",
        "---\nstatus: proposed\n---\n# 002. Short\n\nDate: 2026-1\n",
    );
    write(
        &root,
        "decisions/003-date-second.md",
        "---\nstatus: proposed\n---\n# 003. Second\n\nDate: soon\nDate: 2026-02-03\n",
    );
    write(
        &root,
        "decisions/004-date-later.md",
        "---\nstatus: proposed\n---\n# 004. Later\n\nDate: x 2027-03-04 trailing\n",
    );
    write(
        &root,
        "decisions/005-date-letters.md",
        "---\nstatus: proposed\n---\n# 005. Letters\n\nDate: abcd-12-31\n",
    );
    write(
        &root,
        "decisions/006-date-separator.md",
        "---\nstatus: proposed\n---\n# 006. Separator\n\nDate: 2026x12-31\n",
    );

    let records = read(&root);
    assert_eq!(
        Some("2026-12-31"),
        adr(&records, "decisions/001-date-end.md").date.as_deref()
    );
    assert_eq!(None, adr(&records, "decisions/002-date-short.md").date);
    assert_eq!(None, adr(&records, "decisions/003-date-second.md").date);
    assert_eq!(
        Some("2027-03-04"),
        adr(&records, "decisions/004-date-later.md").date.as_deref()
    );
    assert_eq!(None, adr(&records, "decisions/005-date-letters.md").date);
    assert_eq!(None, adr(&records, "decisions/006-date-separator.md").date);
}

/// Covers: rust-specs/records-of-the-decisions-fixture
#[test]
fn equal_numbers_sort_by_path() {
    let root = project("numbers");
    for name in ["1-first.md", "02-second.md", "2-third.md"] {
        write(
            &root,
            &format!("decisions/{name}"),
            &format!("---\nstatus: proposed\n---\n# {name}\n"),
        );
    }

    let records = read(&root);
    let paths: Vec<&str> = records.adrs.iter().map(|adr| adr.path.as_str()).collect();
    assert_eq!(
        vec![
            "decisions/1-first.md",
            "decisions/02-second.md",
            "decisions/2-third.md",
        ],
        paths
    );
}

/// Covers: rust-specs/list-fields-of-the-decisions-fixture
#[test]
fn list_field_edges() {
    let root = project("lists");
    write(
        &root,
        "decisions/001-lists.md",
        "---\nstatus: accepted\nchecks: [\"./a\\\\b\", \"c/d\"]\ndenies: [x]\nenforced_by: \" validator \"\n---\n# 001. Lists\n",
    );
    write(
        &root,
        "decisions/002-string-applies.md",
        "---\nstatus: accepted\napplies_to: alpha\n---\n# 002. String\n",
    );
    write(
        &root,
        "decisions/003-empty-applies.md",
        "---\nstatus: accepted\napplies_to: []\n---\n# 003. Empty\n",
    );
    write(
        &root,
        "decisions/004-spaced-all.md",
        "---\nstatus: accepted\napplies_to: \" all \"\n---\n# 004. Spaced\n",
    );
    write(
        &root,
        "decisions/005-blank-superseded.md",
        "---\nstatus: superseded\nsuperseded_by: \"  \"\n---\n# 005. Blank\n",
    );
    write(
        &root,
        "decisions/006-blank-enforced.md",
        "---\nstatus: accepted\nenforced_by: \"\"\n---\n# 006. Blank\n",
    );

    let records = read(&root);
    let found = adr(&records, "decisions/001-lists.md");
    assert_eq!(vec!["a/b".to_string(), "c/d".to_string()], found.checks);
    assert_eq!(vec!["x".to_string()], found.denies);
    assert_eq!(vec!["validator".to_string()], found.enforced_by);
    assert_eq!(Vec::<String>::new(), found.malformed);
    assert_eq!(None, found.applies_to);
    assert_eq!(
        None,
        adr(&records, "decisions/002-string-applies.md").applies_to
    );
    assert_eq!(
        None,
        adr(&records, "decisions/003-empty-applies.md").applies_to
    );
    assert_eq!(
        None,
        adr(&records, "decisions/004-spaced-all.md").applies_to
    );
    assert_eq!(
        None,
        adr(&records, "decisions/005-blank-superseded.md").superseded_by
    );
    let blank = adr(&records, "decisions/006-blank-enforced.md");
    assert_eq!(Vec::<String>::new(), blank.enforced_by);
    assert_eq!(vec!["enforced_by".to_string()], blank.malformed);
}

/// Covers: rust-specs/records-of-the-decisions-fixture
#[test]
fn dot_decisions_prefix() {
    let root = project("dot-prefix");
    write(
        &root,
        "001-dot.md",
        "---\nstatus: proposed\n---\n# 001. Dot\n",
    );

    let records = read_decisions(&root, Path::new("."), Path::new("openspec"));
    assert_eq!(
        vec!["001-dot.md".to_string()],
        records
            .adrs
            .iter()
            .map(|adr| adr.path.clone())
            .collect::<Vec<_>>()
    );
}

/// Covers: rust-specs/groups-of-the-decisions-fixture
#[test]
fn group_edges() {
    let root = project("groups");
    write(
        &root,
        "decisions/001-group.md",
        "---\nstatus: accepted\napplies_to: [group:core]\n---\n# 001. Group\n",
    );
    write(&root, "openspec/specs/alpha/osq.yml", "group: core\n");
    write(&root, "openspec/specs/alpha/spec.md", "# alpha\n");
    write(
        &root,
        "openspec/changes/010-new/specs/alpha/osq.yml",
        "group: edge\n",
    );
    write(
        &root,
        "openspec/changes/010-new/specs/delta/osq.yml",
        "group: core\n",
    );
    write(
        &root,
        "openspec/changes/rejected/specs/beta/osq.yml",
        "group: core\n",
    );
    write(
        &root,
        "openspec/changes/.hidden/specs/gamma/osq.yml",
        "group: core\n",
    );
    write(
        &root,
        "openspec/changes/_draft/specs/zeta/osq.yml",
        "group: core\n",
    );

    let records = read(&root);
    let expected: BTreeMap<String, String> = [("alpha", "core"), ("delta", "core")]
        .into_iter()
        .map(|(capability, group)| (capability.to_string(), group.to_string()))
        .collect();
    assert_eq!(expected, records.groups);
    assert_eq!(
        AppliesTo::Capabilities(vec!["alpha".to_string(), "delta".to_string()]),
        adr(&records, "decisions/001-group.md").governs
    );
}
