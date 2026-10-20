//! Tag reading tests.

use std::path::PathBuf;

use osq_kernel_linter::{CodeItem, ScanError, Tag, TagKind, code_tags};

/// The fixture source, never compiled.
const FIXTURE: &str = include_str!("fixtures/code-tags/lib.rs");

/// The fixture's path, as the reader reports it.
const FIXTURE_PATH: &str = "crates/kernel/linter/tests/fixtures/code-tags/lib.rs";

/// One tag of a table row.
struct TagRow {
    /// The tag's kind.
    kind: TagKind,
    /// The tag's target.
    target: &'static str,
    /// The line where the doc attribute starts.
    line: usize,
}

/// One row of the "Items of the tags fixture" table.
struct Row {
    /// The item's name.
    name: &'static str,
    /// The line of the item's name.
    line: usize,
    /// Whether the item is public.
    public: bool,
    /// Whether the item is a test.
    test: bool,
    /// The item's tags, in order.
    tags: &'static [TagRow],
}

/// The file tags of the fixture.
const FILE_TAGS: &[TagRow] = &[
    TagRow {
        kind: TagKind::Implements,
        target: "tools/file-level",
        line: 3,
    },
    TagRow {
        kind: TagKind::Implements,
        target: "tools/inner-module",
        line: 77,
    },
];

/// The rows of the "Items of the tags fixture" table.
const ROWS: &[Row] = &[
    Row {
        name: "declared",
        line: 6,
        public: false,
        test: false,
        tags: &[],
    },
    Row {
        name: "add",
        line: 12,
        public: true,
        test: false,
        tags: &[
            TagRow {
                kind: TagKind::Implements,
                target: "tools/adds-numbers",
                line: 10,
            },
            TagRow {
                kind: TagKind::Adr,
                target: "22",
                line: 11,
            },
        ],
    },
    Row {
        name: "helper",
        line: 19,
        public: false,
        test: false,
        tags: &[],
    },
    Row {
        name: "Total",
        line: 22,
        public: true,
        test: false,
        tags: &[],
    },
    Row {
        name: "Total::value",
        line: 28,
        public: true,
        test: false,
        tags: &[TagRow {
            kind: TagKind::Implements,
            target: "tools/reads-totals",
            line: 27,
        }],
    },
    Row {
        name: "Total::reset",
        line: 33,
        public: false,
        test: false,
        tags: &[],
    },
    Row {
        name: "<Total as Display>::fmt",
        line: 40,
        public: false,
        test: false,
        tags: &[],
    },
    Row {
        name: "<_ as Named>::name",
        line: 47,
        public: false,
        test: false,
        tags: &[],
    },
    Row {
        name: "Named",
        line: 53,
        public: true,
        test: false,
        tags: &[],
    },
    Row {
        name: "Named::name",
        line: 57,
        public: true,
        test: false,
        tags: &[TagRow {
            kind: TagKind::Implements,
            target: "tools/names",
            line: 56,
        }],
    },
    Row {
        name: "Kind",
        line: 61,
        public: true,
        test: false,
        tags: &[],
    },
    Row {
        name: "Alias",
        line: 67,
        public: true,
        test: false,
        tags: &[],
    },
    Row {
        name: "LIMIT",
        line: 70,
        public: true,
        test: false,
        tags: &[],
    },
    Row {
        name: "COUNTER",
        line: 73,
        public: false,
        test: false,
        tags: &[],
    },
    Row {
        name: "inner",
        line: 76,
        public: true,
        test: false,
        tags: &[],
    },
    Row {
        name: "inner::double",
        line: 82,
        public: false,
        test: false,
        tags: &[
            TagRow {
                kind: TagKind::Implements,
                target: "tools/doubles",
                line: 81,
            },
            TagRow {
                kind: TagKind::Adr,
                target: "9",
                line: 81,
            },
        ],
    },
    Row {
        name: "two_plus_two",
        line: 91,
        public: false,
        test: true,
        tags: &[TagRow {
            kind: TagKind::Covers,
            target: "tools/two-plus-two",
            line: 89,
        }],
    },
    Row {
        name: "later_sums",
        line: 97,
        public: false,
        test: true,
        tags: &[TagRow {
            kind: TagKind::Covers,
            target: "tools/later-sums",
            line: 95,
        }],
    },
    Row {
        name: "any_sum",
        line: 106,
        public: false,
        test: true,
        tags: &[TagRow {
            kind: TagKind::Covers,
            target: "tools/any-sum",
            line: 104,
        }],
    },
    Row {
        name: "mention",
        line: 120,
        public: true,
        test: false,
        tags: &[],
    },
];

/// Builds the tag a row expects.
fn tag(row: &TagRow) -> Tag {
    Tag {
        kind: row.kind,
        target: row.target.to_owned(),
        line: row.line,
    }
}

/// Builds the item a row expects.
fn item(row: &Row) -> CodeItem {
    CodeItem {
        name: row.name.to_owned(),
        line: row.line,
        public: row.public,
        test: row.test,
        tags: row.tags.iter().map(tag).collect(),
    }
}

/// Covers: rust-linter/items-of-the-tags-fixture
#[test]
fn items_of_the_tags_fixture() {
    let tags = code_tags(FIXTURE_PATH, FIXTURE).expect("the fixture parses");
    assert_eq!(
        FILE_TAGS.iter().map(tag).collect::<Vec<_>>(),
        tags.file_tags
    );
    let expected: Vec<CodeItem> = ROWS.iter().map(item).collect();
    assert_eq!(expected, tags.items);
}

/// Covers: rust-linter/unparsable-tag-source
#[test]
fn unparsable_tag_source() {
    let error = code_tags("src/lib.rs", "fn main( {\n").expect_err("the source does not parse");
    match error {
        ScanError::Parse { path, line, .. } => {
            assert_eq!(PathBuf::from("src/lib.rs"), path);
            assert!(line > 0, "the parser reports line {line}");
        }
        other => panic!("expected a parse error, got {other:?}"),
    }
}
