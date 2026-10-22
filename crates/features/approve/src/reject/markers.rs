//! Reading a change folder's reject markers directly, never its event streams.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// The marker facts refusal and eligibility read from one change folder.
pub(crate) struct Markers {
    /// `.run/approved`'s text, or `None` without the file.
    pub(crate) approved: Option<String>,
    /// The task names of `.run/running/<n>.pid`.
    pub(crate) running: BTreeSet<String>,
    /// The task numbers of `tasks/<n>.md`.
    pub(crate) tasks: BTreeSet<String>,
    /// The names of `.run/done/<n>`.
    pub(crate) done: BTreeSet<String>,
    /// The task names of `.run/dead/<n>.md`.
    pub(crate) dead: BTreeSet<String>,
    /// The names of `.run/regressed/<n>.md`, with `change` for the change.
    pub(crate) regressed: BTreeSet<String>,
}

/// Reads one change folder's marker files.
///
/// Implements: rust-approve/reject-refusals
/// Implements: rust-approve/reject-eligibility
pub(crate) fn read(folder: &Path) -> Markers {
    let run = folder.join(".run");
    Markers {
        approved: fs::read_to_string(run.join("approved")).ok(),
        running: with_suffix(&run.join("running"), ".pid"),
        tasks: with_suffix(&folder.join("tasks"), ".md"),
        done: names(&run.join("done")),
        dead: with_suffix(&run.join("dead"), ".md"),
        regressed: with_suffix(&run.join("regressed"), ".md"),
    }
}

/// The entry names of `dir` without `suffix`.
fn with_suffix(dir: &Path, suffix: &str) -> BTreeSet<String> {
    names(dir)
        .into_iter()
        .filter_map(|name| name.strip_suffix(suffix).map(str::to_owned))
        .collect()
}

/// The entry names directly under `dir`, or none without the folder.
fn names(dir: &Path) -> BTreeSet<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return BTreeSet::new();
    };
    entries
        .flatten()
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}
