//! Proves `parse_change_id` reads the change ids a Rust command accepts and
//! refuses everything else.

use osq_core::{ChangeIdError, parse_change_id};

/// Proves "Change id names a folder", one row at a time.
///
/// Covers: rust-core/change-id-names-a-folder
#[test]
fn change_id_names_a_folder() {
    let rows = [
        ("310", false, "310-rust-land", true),
        ("0310", false, "310-rust-land", true),
        ("  7  ", false, "007-alpha", true),
        ("7", false, "0007", true),
        ("0", false, "000-zero", true),
        ("31", false, "310-rust-land", false),
        ("310", false, "3100-other", false),
        ("310", false, "310x", false),
        ("310", false, "rust-land", false),
        ("310-rust-land", false, "310-rust-land", true),
        ("310-rust", false, "310-rust-land", false),
        ("310-wrong-slug", false, "310-rust-land", false),
        ("310x", false, "310-rust-land", false),
        ("x-y", false, "x-y", true),
        ("rust-land", false, "310-rust-land", false),
        ("rust-land", true, "310-rust-land", true),
        ("rust-land", true, "rust-land", true),
        ("land", true, "310-rust-land", false),
        ("rust-land", true, "x-rust-land", false),
    ];
    for (input, slug, folder, names) in rows {
        let id = parse_change_id(input, slug)
            .unwrap_or_else(|error| panic!("{input:?} as slug {slug}: {error}"));
        assert_eq!(
            id.names(folder),
            names,
            "{input:?} as slug {slug} naming {folder:?}"
        );
    }
}

/// Proves "Change id refused", one row at a time, with the error's display
/// and its `Error` implementation.
///
/// Covers: rust-core/change-id-refused
#[test]
fn change_id_refused() {
    let forms = "give the change's number, such as 7 or 007, or its full folder name";
    let slug_forms = "give the change's number, such as 7 or 007, its full folder name, or that name without its number";
    let rows = [
        ("310]", false, forms),
        ("31O", false, forms),
        ("", false, forms),
        ("  ", false, forms),
        ("-2", false, forms),
        ("310-", false, forms),
        ("310--x", false, forms),
        ("310_x", false, forms),
        ("Rust-Land", true, slug_forms),
        ("-2", true, slug_forms),
        ("rust land", true, slug_forms),
    ];
    for (input, slug, forms) in rows {
        let error: ChangeIdError = parse_change_id(input, slug)
            .expect_err(&format!("{input:?} as slug {slug} was accepted"));
        let _: &dyn std::error::Error = &error;
        let expected = format!("\"{input}\" is not a change id; {forms}");
        assert_eq!(
            error.to_string(),
            expected,
            "{input:?} as slug {slug} displayed the wrong text"
        );
    }
}
