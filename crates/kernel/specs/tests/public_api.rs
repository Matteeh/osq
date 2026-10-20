//! Pins the specs kernel's public API: items are reachable only from the crate
//! root, and every public function carries an `Implements:` tag.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The items `src/lib.rs` re-exports, by module, as the rust-specs table gives them.
const EXPORTS: &[(&str, &[&str])] = &[
    (
        "document",
        &[
            "ChecklistItem",
            "Frontmatter",
            "Proposal",
            "Sidecar",
            "SidecarError",
            "SyntaxError",
            "TaskFile",
            "VerifyStarts",
            "parse_frontmatter",
            "parse_proposal",
            "parse_sidecar",
            "parse_task_file",
            "parse_task_list",
        ],
    ),
    (
        "markdown",
        &[
            "Delta",
            "LivingSpec",
            "Outcome",
            "Rename",
            "RenameSide",
            "Requirement",
            "Scenario",
            "UnpairedRename",
            "code_ownership",
            "js_trim",
            "normalize_requirement_name",
            "parse_delta",
            "parse_living_spec",
            "parse_requirement",
            "parse_scenario",
            "section",
        ],
    ),
    (
        "merge",
        &[
            "MergeChangeError",
            "MergeError",
            "MergedSpec",
            "merge_change",
            "merge_delta",
            "merge_living_spec",
        ],
    ),
    (
        "owners",
        &[
            "CapabilityOwnership",
            "owner_capabilities",
            "read_capability_ownership",
            "scope_covers_path",
        ],
    ),
    (
        "read",
        &[
            "SpecsError",
            "read_delta",
            "read_living_spec",
            "read_proposal",
            "read_sidecar",
            "read_task_file",
            "read_task_list",
        ],
    ),
    (
        "validate",
        &[
            "FindingCode",
            "SpecFinding",
            "check_delta_targets",
            "validate_change",
            "validate_delta",
            "validate_living_spec",
            "validate_living_specs",
            "validate_merged_change",
        ],
    ),
];

/// The four public methods and the requirement each must name.
const METHODS: &[(&str, &str, &str)] = &[
    ("validate/finding.rs", "as_str", "validation-findings"),
    ("validate/finding.rs", "fix", "validation-findings"),
    ("merge/error.rs", "capability", "merge-refusals"),
    ("merge/error.rs", "requirement", "merge-refusals"),
];

/// Covers: rust-specs/Specs kernel exports from its root only
#[test]
fn exports_from_the_root_only() {
    let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");

    for file in rust_files(&source_dir) {
        let text = std::fs::read_to_string(&file).expect("read source file");
        for (index, line) in text.lines().enumerate() {
            assert!(
                !line.trim().starts_with("pub mod "),
                "{}:{} declares a public module",
                file.display(),
                index + 1
            );
        }
    }

    let lib = std::fs::read_to_string(source_dir.join("lib.rs")).expect("read lib.rs");
    let actual = reexports(&lib);

    let expected_modules: BTreeSet<&str> = EXPORTS.iter().map(|(module, _)| *module).collect();
    let actual_modules: BTreeSet<&str> = actual.keys().map(String::as_str).collect();
    assert_eq!(actual_modules, expected_modules, "modules re-exported");

    for (module, items) in EXPORTS {
        let expected: BTreeSet<&str> = items.iter().copied().collect();
        let actual_items: BTreeSet<&str> = actual
            .get(*module)
            .into_iter()
            .flatten()
            .map(String::as_str)
            .collect();
        assert_eq!(actual_items, expected, "module {module} exports");
    }
}

/// Covers: rust-specs/Specs kernel public functions are tagged
#[test]
fn public_functions_are_tagged() {
    let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");

    for file in rust_files(&source_dir) {
        let text = std::fs::read_to_string(&file).expect("read source file");
        let lines: Vec<&str> = text.lines().collect();
        for (index, line) in lines.iter().enumerate() {
            let Some(rest) = line.trim().strip_prefix("pub fn ") else {
                continue;
            };
            let name = rest.split('(').next().unwrap_or(rest);
            assert!(
                tag_above(&lines, index).is_some(),
                "{}:{}: pub fn {name} has no Implements tag",
                file.display(),
                index + 1
            );
        }
    }

    for (file, method, requirement) in METHODS {
        let path = source_dir.join(file);
        let text = std::fs::read_to_string(&path).expect("read source file");
        let lines: Vec<&str> = text.lines().collect();
        let marker = format!("pub fn {method}(");
        let index = lines
            .iter()
            .position(|line| line.trim().starts_with(&marker))
            .unwrap_or_else(|| panic!("{}: no pub fn {method}", path.display()));
        let expected = format!("Implements: rust-specs/{requirement}");
        assert_eq!(
            tag_above(&lines, index),
            Some(expected.as_str()),
            "{}: pub fn {method}",
            path.display()
        );
    }
}

/// Collects every `.rs` file under `directory`, recursively.
fn rust_files(directory: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_rust_files(directory, &mut files);
    files
}

/// Adds the `.rs` files under `directory` to `files`, then recurses into folders.
fn collect_rust_files(directory: &Path, files: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(directory).expect("read source directory") {
        let path = entry.expect("read directory entry").path();
        if path.is_dir() {
            collect_rust_files(&path, files);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            files.push(path);
        }
    }
}

/// Reads the `pub use` blocks of `source` into the module each block names.
fn reexports(source: &str) -> BTreeMap<String, BTreeSet<String>> {
    let mut modules = BTreeMap::new();
    for statement in source.split("pub use ").skip(1) {
        let body = statement
            .split_once(';')
            .map_or(statement, |(body, _)| body)
            .trim();
        let (module, rest) = body.split_once("::").expect("a pub use names a module");
        let rest = rest.trim();
        let names = rest
            .strip_prefix('{')
            .and_then(|rest| rest.strip_suffix('}'))
            .unwrap_or(rest);
        let items: BTreeSet<String> = names
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect();
        modules
            .entry(module.to_string())
            .or_insert_with(BTreeSet::new)
            .extend(items);
    }
    modules
}

/// Finds the `Implements:` line in the doc and attribute lines above `index`.
fn tag_above<'a>(lines: &[&'a str], index: usize) -> Option<&'a str> {
    let mut cursor = index;
    while cursor > 0 {
        cursor -= 1;
        let trimmed = lines[cursor].trim();
        if let Some(doc) = trimmed.strip_prefix("///") {
            let doc = doc.trim();
            if doc.starts_with("Implements: rust-specs/") {
                return Some(doc);
            }
        } else if !trimmed.starts_with("#[") {
            break;
        }
    }
    None
}
