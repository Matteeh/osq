//! Proves `compute_seal` gives the seal `hashChangeFolder` gives.

use osq_core::compute_seal;

/// The seal of no entries.
const EMPTY: &str = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/// Asserts the seal of `entries`.
fn assert_seal(entries: &[(&str, &[u8])], expected: &str) {
    assert_eq!(compute_seal(entries).as_str(), expected);
}

/// Covers: rust-core/seals-of-entries
#[test]
fn no_entries() {
    assert_seal(&[], EMPTY);
}

/// Covers: rust-core/seals-of-entries
#[test]
fn one_entry() {
    assert_seal(
        &[("proposal.md", b"a\n")],
        "sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd",
    );
}

/// Covers: rust-core/seals-of-entries
#[test]
fn crlf_is_lf() {
    let seal = "sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241";
    assert_seal(&[("a.md", b"x\r\ny\r\n")], seal);
    assert_seal(&[("a.md", b"x\ny\n")], seal);
}

/// Covers: rust-core/seals-of-entries
#[test]
fn tasks_checkboxes_reset() {
    let seal = "sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a";
    assert_seal(&[("tasks.md", b"- [x] 1. a\n  - [X] 2. b\n")], seal);
    assert_seal(&[("tasks.md", b"- [ ] 1. a\n  - [ ] 2. b\n")], seal);
}

/// Covers: rust-core/seals-of-entries
#[test]
fn nested_tasks_keeps_checkboxes() {
    assert_seal(
        &[("notes/tasks.md", b"- [x] 1. a\n")],
        "sha256:fa65172b5ab5cee5da25838e4c968ded29d7a4837aa65283758225af2586088f",
    );
}

/// Covers: rust-core/seals-of-entries
#[test]
fn no_break_space_is_whitespace() {
    assert_seal(
        &[("tasks.md", "\u{a0}- [x] a\n".as_bytes())],
        "sha256:ba2854b7aadd6685d64d1624f7b144e4b5e5d69e017060244b846491ef0b304b",
    );
}

/// Covers: rust-core/seals-of-entries
#[test]
fn next_line_is_not_whitespace() {
    assert_seal(
        &[("tasks.md", "\u{85}- [x] a\n".as_bytes())],
        "sha256:52902fea6a1daefdb3316706390ca2fc5a816709f0eb28a514aacc0a31f007d0",
    );
}

/// Covers: rust-core/seals-of-entries
#[test]
fn invalid_utf8_is_replaced() {
    assert_seal(
        &[("b.bin", &[0xFF, 0xFE, 0x41])],
        "sha256:f2859d36ed56daac01133dde3da6a05522a65da80d2fe1659fd1cf64716c8ac8",
    );
}

/// Covers: rust-core/javascript-path-order
#[test]
fn paths_in_utf16_order() {
    let wide: (&str, &[u8]) = ("a-\u{ff61}.md", b"2\n");
    let astral: (&str, &[u8]) = ("a-\u{1f600}.md", b"1\n");
    let utf16 = "sha256:f47bbfc7ba5286ec24f4ddf82d9bf58771d785ef0b0806c45b8e4ca2ff469938";
    assert_seal(&[wide, astral], utf16);
    assert_seal(&[astral, wide], utf16);
}

/// Covers: rust-core/seals-of-entries
#[test]
fn checkbox_needs_letter_and_both_brackets() {
    let text = "- [y] a\n- [xz\n- x] b\n-[x] c\n[x] d\n- [x] e\n";
    assert_seal(
        &[("tasks.md", text.as_bytes())],
        "sha256:82918e059b62dd34ad4dde6f4ed34e5e89579de9340a9fda754a5f12aae84e1a",
    );
}
