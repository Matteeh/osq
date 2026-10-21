//! Proves approvals against the markers TypeScript wrote for the golden fixture.

mod support;

use support::{fixture, marker_bytes, run, scratch_copy};

/// Proves "Golden approvals" on a fresh scratch copy of the fixture.
///
/// Covers: rust-approve/golden-approvals
#[test]
fn golden_approvals() {
    let root = scratch_copy("approve-repo", "golden_approvals");
    let rows = [
        (
            "001-alpha-twice",
            "1",
            "sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1",
        ),
        (
            "002-gamma",
            "002-gamma",
            "sha256:49b75cb4fb4c7919d8d8cefc32d6741e12571819b450b5f5033840c8dce4f715",
        ),
    ];
    for (folder, query, expected) in rows {
        run(&root, query).unwrap_or_else(|error| panic!("{folder}: {error}"));
        let marker = marker_bytes(&root, folder).expect("the approval marker is written");
        let golden = fixture("approve-markers").join(format!("{folder}.approved"));
        let golden = std::fs::read(golden).expect("the golden marker reads");
        assert_eq!(marker, golden, "{folder}: golden marker");
        assert_eq!(
            String::from_utf8(marker).expect("the marker is text"),
            format!("{expected}\n"),
            "{folder}: expected seal"
        );
    }
}
