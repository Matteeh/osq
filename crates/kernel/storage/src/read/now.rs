//! Reading one change folder's task markers for their current status facts.
//!
//! Mirrors the marker reads of TypeScript's `readChangeFolder` that
//! `deriveTaskStateFromSnapshot` uses, and the manual read of its
//! `doneMarkerIsManual`.
//!
//! Implements: rust-storage/now-facts

use std::fs;
use std::path::Path;

use osq_kernel_specs::parse_frontmatter;
use yaml_rust2::Yaml;

/// The facts of one change folder that give each task its current status.
///
/// Implements: rust-storage/now-facts
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NowFacts {
    /// Whether `proposal.md` or `spec.md` exists, following symlinks.
    pub has_proposal: bool,
    /// Every task entry's marker facts, in byte order of the entry names.
    pub tasks: Vec<NowTask>,
}

/// One task of a change folder and the markers the folder holds for it.
///
/// Implements: rust-storage/now-facts
#[expect(
    clippy::struct_excessive_bools,
    reason = "rust-storage/now-facts names five independent boolean facts"
)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NowTask {
    /// The task file's name without `.md`.
    pub id: String,
    /// Whether `.run/done/<id>` exists, of any kind.
    pub done: bool,
    /// Whether `.run/done/<id>` records `manual: true` in its frontmatter.
    pub manual: bool,
    /// Whether `.run/dead/<id>.md` exists, of any kind.
    pub dead: bool,
    /// Whether `.run/regressed/<id>.md` exists, of any kind.
    pub regressed: bool,
    /// Whether `.run/running/<id>.pid` exists, of any kind.
    pub running: bool,
}

/// Reads the marker facts of every task in one change folder; never fails.
///
/// Implements: rust-storage/now-facts
#[must_use]
pub fn read_now_facts(folder: &Path) -> NowFacts {
    NowFacts {
        has_proposal: folder.join("proposal.md").exists() || folder.join("spec.md").exists(),
        tasks: task_ids(folder)
            .into_iter()
            .map(|id| task_facts(folder, id))
            .collect(),
    }
}

/// Every task file name without `.md` under `tasks/`, in byte order.
fn task_ids(folder: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(folder.join("tasks")) else {
        return Vec::new();
    };
    let mut ids: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter_map(|name| name.strip_suffix(".md").map(ToOwned::to_owned))
        .collect();
    ids.sort();
    ids
}

/// The marker facts of one task.
fn task_facts(folder: &Path, id: String) -> NowTask {
    let run = folder.join(".run");
    let done = run.join("done").join(&id);
    NowTask {
        manual: manual_marker(&done),
        done: entry_exists(&done),
        dead: entry_exists(&run.join("dead").join(format!("{id}.md"))),
        regressed: entry_exists(&run.join("regressed").join(format!("{id}.md"))),
        running: entry_exists(&run.join("running").join(format!("{id}.pid"))),
        id,
    }
}

/// Whether any entry exists at a path, whatever its kind and even when broken.
fn entry_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

/// Whether a done marker reads as text whose frontmatter holds `manual: true`.
fn manual_marker(path: &Path) -> bool {
    fs::read_to_string(path).is_ok_and(|text| manual_is_true(&text))
}

/// Whether a document's frontmatter holds the boolean key `manual: true`.
fn manual_is_true(text: &str) -> bool {
    parse_frontmatter(text).is_ok_and(|frontmatter| {
        matches!(
            frontmatter.data.get(&Yaml::String("manual".to_owned())),
            Some(Yaml::Boolean(true))
        )
    })
}
