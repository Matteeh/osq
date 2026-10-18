//! Shared helpers for the golden parse-parity tests.
//!
//! Both `golden_cases.rs` and `golden_corpus.rs` include this module. It
//! digests a parsed value the way rust-specs "TypeScript parse parity" says,
//! builds every golden entry from a parse, and names the first difference
//! between two JSON values.

mod diff;
mod digest;
mod entries;

pub use diff::{Difference, first_difference};
pub use digest::digest;
pub use entries::{delta_entry, living_entry, proposal_entry, task_entry, task_list_entry};

use serde_json::Value;
use std::path::{Path, PathBuf};

/// The directory holding the committed golden JSON files.
#[must_use]
pub fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

/// Reads one golden JSON file as its array value.
///
/// # Panics
///
/// Panics when the file cannot be read or is not JSON.
#[must_use]
pub fn read_golden(name: &str) -> Value {
    let path = golden_dir().join(name);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}

/// Fails once with the count of `failures` and the first twenty lines.
///
/// # Panics
///
/// Panics when `failures` is not empty.
pub fn assert_no_failures(failures: &[String]) {
    if failures.is_empty() {
        return;
    }
    let shown: Vec<&str> = failures.iter().take(20).map(String::as_str).collect();
    panic!(
        "{} disagreeing documents:\n{}",
        failures.len(),
        shown.join("\n")
    );
}
