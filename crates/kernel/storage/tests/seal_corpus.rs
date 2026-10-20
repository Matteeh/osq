//! Replays the seals of this repository's live archive.
//!
//! This is a corpus test (rust-core "Corpus tests"): it reads the archive
//! outside this crate, so it carries the corpus ignore and runs under
//! `scripts/verify-rust.sh --include-ignored`.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::change_folder_seal;

/// The 25 changes whose seal differs from their marker: change 028 rewrote
/// them after their approval. They are 002 to 016 and 018 to 027.
const REWRITTEN: [u32; 25] = [
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
];

/// The repository root, three folders above the storage manifest.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/storage")
        .to_path_buf()
}

/// Proves the folders whose seal differs from their marker are exactly the rewritten ones.
///
/// Covers: rust-storage/archived-changes-keep-their-seals
#[ignore = "corpus test: reads the live archive"]
#[test]
fn archived_changes_keep_their_seals() {
    let archive = repository_root().join("openspec/changes/archive");
    let mut differing = Vec::new();
    let mut checked = 0;
    for entry in fs::read_dir(&archive).unwrap() {
        let folder = entry.unwrap().path();
        let Ok(marker) = fs::read_to_string(folder.join(".run/approved")) else {
            continue;
        };
        checked += 1;
        let seal = change_folder_seal(&folder).unwrap();
        if seal.as_str() != marker.trim() {
            let name = folder.file_name().unwrap().to_string_lossy().into_owned();
            let number: u32 = name
                .split('-')
                .next()
                .and_then(|lead| lead.parse().ok())
                .unwrap_or(0);
            differing.push(number);
        }
    }
    differing.sort_unstable();
    assert!(checked >= 200, "checked only {checked} archived changes");
    assert_eq!(differing, REWRITTEN);
}
