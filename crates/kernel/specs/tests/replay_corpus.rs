//! Corpus test: replaying this repository's archive gives its living specs.
//!
//! It reads the live archive, living specs and event files, so it is a corpus
//! test (rust-core "Corpus tests"): each test carries the corpus ignore, runs
//! under `scripts/verify-rust.sh`, and cargo-mutants leaves it out.

use osq_kernel_specs::merge_change;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// The repository root, three folders above this crate's manifest.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/specs")
        .to_path_buf()
}

/// The capabilities that predate the merge's Purpose rule and keep one blank
/// line after `## Purpose`.
fn purpose_blank_line_capabilities() -> [&'static str; 6] {
    [
        "cli-foundation",
        "metrics-and-reporting",
        "spec-lint-and-approve",
        "status-inspection",
        "watcher-and-harness",
        "web-inspection",
    ]
}

/// The last `archived` timestamp of one change folder, when it recorded one.
fn last_archived_timestamp(change: &Path) -> Option<String> {
    let text = std::fs::read_to_string(change.join(".run/events/change.jsonl")).ok()?;
    let mut last = None;
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if value.get("type").and_then(|kind| kind.as_str()) != Some("archived") {
            continue;
        }
        if let Some(stamp) = value.get("timestamp").and_then(|stamp| stamp.as_str()) {
            last = Some(stamp.to_string());
        }
    }
    last
}

/// The folders directly under `dir` whose names pass `keep`, in byte order.
fn folders_in(dir: &Path, keep: impl Fn(&Path) -> bool) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut folders: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .filter(|path| keep(path))
        .collect();
    folders.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    folders
}

/// The archived folders in landing order: eventless ones first by name, then
/// the rest by the last `archived` timestamp, then by name.
fn archived_folders(archive: &Path) -> Vec<PathBuf> {
    let mut landed: Vec<(Option<String>, PathBuf)> = folders_in(archive, |_| true)
        .into_iter()
        .map(|path| (last_archived_timestamp(&path), path))
        .collect();
    landed.sort_by(|(left_stamp, left), (right_stamp, right)| {
        left_stamp
            .cmp(right_stamp)
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });
    landed.into_iter().map(|(_, path)| path).collect()
}

/// The active change folders holding the archive record, in byte order.
fn applying_folders(changes: &Path) -> Vec<PathBuf> {
    folders_in(changes, |path| {
        path.file_name().is_some_and(|name| name != "archive")
            && path.join(".run/archive-specs.json").is_file()
    })
}

/// Every folder the replay merges, in order.
fn replay_order(root: &Path) -> Vec<PathBuf> {
    let mut folders = archived_folders(&root.join("openspec/changes/archive"));
    folders.extend(applying_folders(&root.join("openspec/changes")));
    folders
}

/// Every capability with a living folder or a delta in a replayed change.
fn replay_capabilities(root: &Path, folders: &[PathBuf]) -> Vec<String> {
    let mut names: BTreeSet<String> = folders_in(&root.join("openspec/specs"), |_| true)
        .into_iter()
        .filter_map(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .collect();
    for folder in folders {
        for delta in folders_in(&folder.join("specs"), |path| path.join("spec.md").is_file()) {
            if let Some(name) = delta.file_name() {
                names.insert(name.to_string_lossy().into_owned());
            }
        }
    }
    names.into_iter().collect()
}

/// Merges each folder into the scratch specs folder, writing or removing before
/// the next.
fn replay(folders: &[PathBuf], scratch: &Path) {
    for folder in folders {
        let merged = merge_change(folder, scratch)
            .unwrap_or_else(|error| panic!("{}: {error}", folder.display()));
        for spec in merged {
            let target = scratch.join(&spec.capability);
            match spec.text {
                Some(text) => {
                    std::fs::create_dir_all(&target).expect("the scratch folder is writable");
                    std::fs::write(target.join("spec.md"), text).expect("the scratch file writes");
                }
                None => {
                    let _ = std::fs::remove_dir_all(&target);
                }
            }
        }
    }
}

/// The 1-based first differing line of two texts, or none when they are equal.
fn first_difference(left: &str, right: &str) -> Option<(usize, String, String)> {
    let left_lines: Vec<&str> = left.split('\n').collect();
    let right_lines: Vec<&str> = right.split('\n').collect();
    let total = left_lines.len().max(right_lines.len());
    for index in 0..total {
        let a = left_lines.get(index).copied().unwrap_or_default();
        let b = right_lines.get(index).copied().unwrap_or_default();
        if a != b {
            return Some((index + 1, a.to_string(), b.to_string()));
        }
    }
    None
}

/// The failure line for one capability, when the living spec and the replay
/// disagree under the Purpose rule.
fn compare_capability(root: &Path, scratch: &Path, capability: &str) -> Option<String> {
    let living_path = root.join("openspec/specs").join(capability).join("spec.md");
    let living = std::fs::read_to_string(&living_path).ok();
    let replayed_path = scratch.join(capability).join("spec.md");
    let replayed = std::fs::read_to_string(&replayed_path).ok();
    let six = purpose_blank_line_capabilities().contains(&capability);

    match (living, replayed) {
        (None, None) => None,
        (Some(_), None) => Some(format!(
            "{capability}: replay ends with none but a living spec exists"
        )),
        (None, Some(_)) => Some(format!(
            "{capability}: replay produced a spec but the living folder is absent"
        )),
        (Some(living), Some(replayed)) => {
            if six && living == replayed {
                return Some(format!(
                    "{capability}: living spec matches without removing the Purpose blank line"
                ));
            }
            let expected = if six {
                living.replacen("## Purpose\n\n", "## Purpose\n", 1)
            } else {
                living.clone()
            };
            first_difference(&expected, &replayed).map(|(line, expected, actual)| {
                format!("{capability}: first difference at line {line}\n- {expected}\n+ {actual}")
            })
        }
    }
}

/// Covers: rust-specs/living-specs-replay
#[ignore = "corpus test: reads the live archive and living specs"]
#[test]
fn archive_replays_living_specs() {
    let root = repository_root();
    let scratch = Path::new(env!("CARGO_TARGET_TMPDIR")).join("replay-specs");
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).expect("the scratch folder creates");

    let folders = replay_order(&root);
    replay(&folders, &scratch);

    let capabilities = replay_capabilities(&root, &folders);
    assert!(!capabilities.is_empty(), "no capability to replay");
    for name in purpose_blank_line_capabilities() {
        assert!(
            capabilities.iter().any(|capability| capability == name),
            "the {name} capability is missing from the replay"
        );
    }

    let mut failures: Vec<String> = Vec::new();
    for capability in &capabilities {
        if let Some(failure) = compare_capability(&root, &scratch, capability) {
            failures.push(failure);
        }
    }
    assert!(
        failures.is_empty(),
        "living spec replay failures:\n{}",
        failures.join("\n")
    );
}
