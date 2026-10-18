//! Document parser tests: frontmatter, change ids and proposals.

#[path = "parsing_documents_tasks.rs"]
mod tasks;

#[path = "parsing_documents_sidecar.rs"]
mod sidecar;

use osq_kernel_specs::{parse_frontmatter, parse_proposal};
use yaml_rust2::yaml::{Hash, Yaml};

/// The string value of a top-level frontmatter key.
fn frontmatter_string(mapping: &Hash, key: &str) -> Option<String> {
    mapping
        .get(&Yaml::String(key.to_string()))
        .and_then(Yaml::as_str)
        .map(str::to_string)
}

/// One row of the "Frontmatter syntax errors" table.
struct FrontmatterRow {
    /// The document to split.
    document: &'static str,
    /// The string `title`, or `None` when the key is absent or not a string.
    title: Option<&'static str>,
    /// The body after the frontmatter.
    body: &'static str,
    /// Whether the mapping is empty.
    empty: bool,
    /// The line of the expected syntax error, or `None` when it parses.
    error: Option<usize>,
}

/// Covers: rust-specs/frontmatter-syntax-errors
#[test]
fn frontmatter_syntax_errors() {
    let rows = [
        FrontmatterRow {
            document: "---\ntitle: a\n---\nbody",
            title: Some("a"),
            body: "body",
            empty: false,
            error: None,
        },
        FrontmatterRow {
            document: "---\r\ntitle: a\r\n---\r\nbody",
            title: Some("a"),
            body: "body",
            empty: false,
            error: None,
        },
        FrontmatterRow {
            document: "---\n\n---\nbody",
            title: None,
            body: "body",
            empty: true,
            error: None,
        },
        FrontmatterRow {
            document: "no frontmatter",
            title: None,
            body: "no frontmatter",
            empty: true,
            error: None,
        },
        FrontmatterRow {
            document: "---\ntitle: a\nb: : :\n---\n",
            title: None,
            body: "",
            empty: true,
            error: Some(3),
        },
        FrontmatterRow {
            document: "---\ntitle: a\nscope: [x\nverify: y\n---\n",
            title: None,
            body: "",
            empty: true,
            error: Some(4),
        },
        FrontmatterRow {
            document: "---\n- a\n---\n",
            title: None,
            body: "",
            empty: true,
            error: Some(2),
        },
    ];
    for row in rows {
        if let Some(line) = row.error {
            let error = parse_frontmatter(row.document)
                .expect_err(&format!("expected an error for {:?}", row.document));
            assert_eq!(line, error.line, "line of {:?}", row.document);
            continue;
        }
        let frontmatter = parse_frontmatter(row.document)
            .unwrap_or_else(|error| panic!("{:?}: {error:?}", row.document));
        assert_eq!(row.body, frontmatter.body, "body of {:?}", row.document);
        assert_eq!(
            row.title,
            frontmatter_string(&frontmatter.data, "title").as_deref(),
            "title of {:?}",
            row.document
        );
        assert_eq!(
            row.empty,
            frontmatter.data.is_empty(),
            "emptiness of {:?}",
            row.document
        );
    }
}

/// Covers: rust-specs/change-id-lists
#[test]
fn change_id_lists() {
    let text = "---\ndepends_on: [\"214\", 7, \"abc\", \"12-x\", \" 9 \", \"0042\"]\n---\n";
    let proposal = parse_proposal(text).expect("a proposal");
    assert_eq!(
        vec!["214", "007", "abc", "012", "009", "042"],
        proposal.depends_on
    );
}

/// Covers: rust-specs/proposal-fields
#[test]
fn proposal_fields() {
    let text = "---\ntitle: \"  P  \"\ndepends_on: [\"214\", 7]\nfixes: 3\nfeatures:\n  reads: [rust-core, \" languages \"]\nverify: \" sh v.sh \"\n---\n## Goal\nG.\n\n## Contract\n| a | b |\n|---|---|\n| 1 | 2 |\n\nx\n\n| c |\n|-|\n| 3 |\n\n## Non-goals\n- n\n\n## Delta\n- d\n";
    let proposal = parse_proposal(text).expect("a proposal");
    assert_eq!("P", proposal.title);
    assert_eq!(vec!["214", "007"], proposal.depends_on);
    assert_eq!(Vec::<String>::new(), proposal.fixes);
    assert_eq!(vec!["rust-core", "languages"], proposal.reads);
    assert_eq!("G.", proposal.goal);
    assert_eq!(2, proposal.contract_tables);
    assert_eq!("- n", proposal.non_goals);
    assert_eq!("- d", proposal.delta);
    assert_eq!("sh v.sh", proposal.verify);
}

/// Reads the contract table count of a proposal with the given contract section.
fn contract_tables(contract: &str) -> usize {
    let text = format!("---\nfoo: 1\n---\n## Contract\n{contract}");
    parse_proposal(&text).expect("a proposal").contract_tables
}

/// Covers: rust-specs/proposal-fields
#[test]
fn contract_table_edges() {
    let rows = [
        ("|x|\n|-|\n|1|", 1),
        ("|a|\n|1|", 0),
        ("|a|\n|x|\n|1|", 0),
        ("|a|\n|-|\n", 0),
        ("|a|\n|-|\n||\n", 0),
        ("||\n|-|\n|1|", 0),
        ("|a|\n||\n|1|", 0),
        ("|a|\n|-|\n|1| x\n", 1),
        ("|a|\n|-|\n|1|\n\n|b|\n|-|\n|2|", 2),
        ("|a|\r\n|-|\r\n|1|\r\n", 1),
        ("|a|\r\n|-|\r\n|1|\r\n|2|\r\n|3|", 1),
        ("|a|\n|-|\n|1|\n|b|\n|-|\n|2|", 1),
        ("|a|\r\n|-|\r\n|1|\r\n|b|\r\n|-|\r\n|2|\r\n", 1),
    ];
    for (contract, expected) in rows {
        assert_eq!(expected, contract_tables(contract), "contract {contract:?}");
    }
}

/// Covers: rust-specs/proposal-without-fields
#[test]
fn proposal_without_fields() {
    let rows = [
        "---\ntitle: 5\nfeatures: plain\n---\nno sections",
        "no frontmatter\n## Goal\nStill read.",
    ];
    let first = parse_proposal(rows[0]).expect("a proposal");
    assert_eq!("", first.title);
    assert_eq!(Vec::<String>::new(), first.depends_on);
    assert_eq!(Vec::<String>::new(), first.fixes);
    assert_eq!(Vec::<String>::new(), first.reads);
    assert_eq!("", first.goal);
    assert_eq!("", first.contract);
    assert_eq!(0, first.contract_tables);
    assert_eq!("", first.non_goals);
    assert_eq!("", first.delta);
    assert_eq!("", first.verify);

    let second = parse_proposal(rows[1]).expect("a proposal");
    assert_eq!("Still read.", second.goal);
    assert_eq!("", second.title);
    assert_eq!("", second.contract);
    assert_eq!(0, second.contract_tables);
    assert_eq!("", second.non_goals);
    assert_eq!("", second.delta);
    assert_eq!("", second.verify);
    assert_eq!(Vec::<String>::new(), second.depends_on);
    assert_eq!(Vec::<String>::new(), second.fixes);
    assert_eq!(Vec::<String>::new(), second.reads);
}
