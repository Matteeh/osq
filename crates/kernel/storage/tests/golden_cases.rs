//! Fast fixture counterparts of `archive_corpus.rs`'s two corpus tests.
//!
//! cargo-mutants leaves the corpus tests out, so the exact-cost rule they
//! prove over the live archive is pinned here on the crate's own fixture.

use std::path::{Path, PathBuf};

use osq_kernel_storage::{ChangeEntry, Location, build_read_model, read_change};
use rusqlite::Connection;

/// The cost the fixture's task stream reports, as TypeScript's number parse
/// reads the 17-digit decimal `0.12749423999999998`.
const EXACT_COST: f64 = 0.127_494_239_999_999_98;

/// The fixture project holding one 17-digit `tokens` cost.
fn project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exact-cost")
}

/// The fixture's archived change as a listing entry.
fn entry() -> ChangeEntry {
    ChangeEntry {
        folder: String::from("001-cost"),
        location: Location::Archived,
        path: project().join("openspec/changes/archive/001-cost"),
    }
}

/// Proves a task stream's cost sums as exactly as TypeScript's parse does.
///
/// Covers: rust-storage/golden-rows
#[test]
fn cost_sums_exactly() {
    let snapshot = read_change(&entry()).expect("the fixture change reads");
    let facts = snapshot.facts.expect("the change has events");
    assert_eq!(facts.cost.map(f64::to_bits), Some(EXACT_COST.to_bits()));
}

/// Proves the read model's `changes` row carries that exact cost.
///
/// Covers: rust-storage/golden-rows
#[test]
fn read_model_carries_the_exact_cost() {
    let path = Path::new(env!("CARGO_TARGET_TMPDIR")).join("exact_cost.sqlite");
    build_read_model(&project(), &path).expect("the read model writes");
    let connection = Connection::open(&path).expect("the read model opens");
    let cost: f64 = connection
        .query_row("SELECT cost FROM changes WHERE id = '001'", [], |row| {
            row.get(0)
        })
        .expect("the row reads");
    assert_eq!(cost.to_bits(), EXACT_COST.to_bits());
}
