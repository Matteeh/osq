//! Tag-reading cases the fixture source cannot reach.

use osq_kernel_linter::{Tag, TagKind, code_tags};

/// One item reduced to what these tests check.
struct Seen {
    /// The item's name.
    name: String,
    /// Whether the item is public.
    public: bool,
    /// Whether the item is a test.
    test: bool,
    /// The item's tags.
    tags: Vec<Tag>,
}

/// Reads one source and reduces each item to a `Seen`.
fn seen(source: &str) -> Vec<Seen> {
    code_tags("src/lib.rs", source)
        .expect("the source parses")
        .items
        .into_iter()
        .map(|item| Seen {
            name: item.name,
            public: item.public,
            test: item.test,
            tags: item.tags,
        })
        .collect()
}

/// The tag a source expects.
fn tag(kind: TagKind, target: &str, line: usize) -> Tag {
    Tag {
        kind,
        target: target.to_owned(),
        line,
    }
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn unions_and_trait_and_impl_constants_are_items() {
    let source = concat!(
        "/// Bits.\n",
        "/// Implements: tools/bits\n",
        "pub union Bits { value: u32 }\n",
        "\n",
        "pub trait T {\n",
        "    /// The count.\n",
        "    /// Implements: tools/count\n",
        "    const N: u32;\n",
        "}\n",
        "\n",
        "macro_rules! cases { fn hidden() {} }\n",
    );
    let seen = seen(source);
    let names: Vec<&str> = seen.iter().map(|item| item.name.as_str()).collect();
    assert_eq!(vec!["Bits", "T", "T::N"], names);
    assert_eq!(
        vec![tag(TagKind::Implements, "tools/bits", 2)],
        seen[0].tags
    );
    assert_eq!(
        vec![tag(TagKind::Implements, "tools/count", 7)],
        seen[2].tags
    );
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn impl_constants_are_items_with_their_visibility() {
    let source = concat!(
        "pub struct S;\n",
        "impl S {\n",
        "    /// The limit.\n",
        "    /// Implements: tools/limit\n",
        "    pub const L: u32 = 1;\n",
        "}\n",
    );
    let seen = seen(source);
    assert_eq!(
        vec!["S", "S::L"],
        seen.iter().map(|i| i.name.as_str()).collect::<Vec<_>>()
    );
    assert!(seen[1].public);
    assert_eq!(
        vec![tag(TagKind::Implements, "tools/limit", 4)],
        seen[1].tags
    );
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn macro_functions_take_their_attributes_and_are_never_public() {
    let source = concat!(
        "m! {\n",
        "    /// Covers: tools/plain\n",
        "    pub async fn work() {}\n",
        "}\n",
    );
    let seen = seen(source);
    assert_eq!(1, seen.len());
    assert_eq!("work", seen[0].name);
    assert!(!seen[0].public);
    assert!(!seen[0].test);
    assert_eq!(vec![tag(TagKind::Covers, "tools/plain", 2)], seen[0].tags);
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn a_macro_function_at_the_first_token_keeps_its_attributes() {
    let source = "m! { #[test] fn plain() {} }\n";
    let seen = seen(source);
    assert_eq!(1, seen.len());
    assert!(seen[0].test);
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn a_bracket_group_before_an_attribute_is_not_one() {
    let source = "m! { [x] #[test] fn plain() {} }\n";
    let seen = seen(source);
    assert_eq!(1, seen.len());
    assert!(seen[0].test);
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn a_bracket_group_after_other_tokens_is_not_an_attribute() {
    let source = "m! { ! [test] fn plain() {} }\n";
    let seen = seen(source);
    assert_eq!(1, seen.len());
    assert!(!seen[0].test);
    assert_eq!(seen[0].tags, Vec::new());
}
