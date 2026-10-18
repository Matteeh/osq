//! Markdown parser tests: living specs, ownership, deltas and sections.

use osq_kernel_specs::{RenameSide, code_ownership, parse_delta, parse_living_spec, section};

/// Covers: rust-specs/living-spec-parts
#[test]
fn living_spec_parts() {
    let first = "# cap Specification\n\n## Purpose\nDoes things.\n\n## Requirements\n\n### Requirement: One\nThe system SHALL one.\n\n~~~md\n### Requirement: Fenced\n~~~\n\n### Requirement: Two\nThe system SHALL two.\n\n## Notes\n### Requirement: Outside\n";
    let rows = [
        (
            first,
            "cap Specification",
            "Does things.",
            vec!["One", "Two"],
        ),
        (
            "\u{feff}# T\r\n\r\n## purpose\r\n\r\n  Lower.  \r\n\r\n## Requirements\r\n### Requirement: R\r\nThe system SHALL r.\r\n",
            "T",
            "Lower.",
            vec!["R"],
        ),
        (
            "# No purpose\n\n## Purpose\n\n## Requirements\n",
            "No purpose",
            "",
            vec![],
        ),
        ("no headings at all", "", "", vec![]),
    ];
    for (text, title, purpose, requirements) in rows {
        let spec = parse_living_spec(text);
        assert_eq!(title, spec.title, "title of {text:?}");
        assert_eq!(purpose, spec.purpose, "purpose of {text:?}");
        let names: Vec<&str> = spec.requirements.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(requirements, names, "requirements of {text:?}");
    }
}

/// Covers: rust-specs/fenced-header-stays-in-the-body
#[test]
fn fenced_header_stays_in_the_body() {
    let text = "# cap Specification\n\n## Purpose\nDoes things.\n\n## Requirements\n\n### Requirement: One\nThe system SHALL one.\n\n~~~md\n### Requirement: Fenced\n~~~\n\n### Requirement: Two\nThe system SHALL two.\n\n## Notes\n### Requirement: Outside\n";
    let spec = parse_living_spec(text);
    assert_eq!(
        "The system SHALL one.\n\n~~~md\n### Requirement: Fenced\n~~~",
        spec.requirements[0].body
    );

    let fences = "# F\n\n## Requirements\n~~~md\ninside\n### Requirement: Hidden\n~~~\n### Requirement: Real\n~~~~md\ninside\n~~~\n### Requirement: Hidden2\n~~~~\n### Requirement: Real2\n~~~ md\n~~~ not closing\n### Requirement: Hidden3\n~~~\n### Requirement: Real3\n";
    let names: Vec<String> = parse_living_spec(fences)
        .requirements
        .into_iter()
        .map(|requirement| requirement.name)
        .collect();
    assert_eq!(vec!["Real", "Real2", "Real3"], names);
}

/// Covers: rust-specs/code-ownership-source-comment
#[test]
fn code_ownership_source_comment() {
    let text =
        "### Requirement: Code ownership\n<!-- source: a/**, b.ts ,, -->\nThe x SHALL own them.";
    assert_eq!(vec!["a/**", "b.ts"], code_ownership(text));
}

/// Covers: rust-specs/code-ownership-quoted-tokens
#[test]
fn code_ownership_quoted_tokens() {
    let text = "### Requirement: Code ownership\nThe x SHALL own `src/a/**`, `name`, `src/a/**` and `c\\d`.\n##not\n`src/b/**`\n## Next\n`not/this` ";
    assert_eq!(vec!["src/a/**", "c\\d", "src/b/**"], code_ownership(text));
}

/// Covers: rust-specs/no-code-ownership-header
#[test]
fn no_code_ownership_header() {
    assert_eq!(
        Vec::<String>::new(),
        code_ownership("### Requirement: Other\n`src/x/**` ")
    );
}

/// Covers: rust-specs/delta-spec-operations
#[test]
fn delta_spec_operations() {
    let text = "# Spec Delta: cap\n\n## Purpose\nWhy.\n\n## ADDED Requirements\n### Requirement: New\nThe system SHALL new.\n\n## MODIFIED Requirements\n### Requirement: Changed\nThe system SHALL change.\n\n## REMOVED Requirements\n### Requirement: Gone\n- `### Requirement: Also gone`\n\n## RENAMED Requirements\n- FROM: `### Requirement: Old`\n- TO: `### Requirement: Fresh`\n- FROM: Old bare\n- TO: `### Requirement: Orphan`\n- FROM: `### Requirement: Dangling`\n\n## added requirements\n### Requirement: Second added\nThe system SHALL two.\n";
    let delta = parse_delta(text);
    assert_eq!("cap", delta.title);
    assert_eq!("Why.", delta.purpose);
    let added: Vec<&str> = delta.added.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(vec!["New", "Second added"], added);
    let modified: Vec<&str> = delta.modified.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(vec!["Changed"], modified);
    assert_eq!(vec!["Gone", "Also gone"], delta.removed);
    assert_eq!(1, delta.renamed.len());
    assert_eq!("Old", delta.renamed[0].from);
    assert_eq!("Fresh", delta.renamed[0].to);
    assert_eq!(vec!["- FROM: Old bare"], delta.invalid_renames);
    assert_eq!(2, delta.unpaired_renames.len());
    assert_eq!(RenameSide::To, delta.unpaired_renames[0].side);
    assert_eq!("Orphan", delta.unpaired_renames[0].name);
    assert_eq!(RenameSide::From, delta.unpaired_renames[1].side);
    assert_eq!("Dangling", delta.unpaired_renames[1].name);
}

/// Covers: rust-specs/delta-titles
#[test]
fn delta_titles() {
    let rows = [
        ("# Spec Delta: cap\n", "cap"),
        ("# spec delta :\tcap\n", "cap"),
        ("# cap\n", "cap"),
        ("## ADDED Requirements\n", ""),
    ];
    for (text, title) in rows {
        assert_eq!(title, parse_delta(text).title, "title of {text:?}");
    }
}

/// Covers: rust-specs/section-text
#[test]
fn section_text() {
    let rows = [
        ("## Goal\n\nShip it.\n\n## Verify\nx", "Goal", "Ship it."),
        ("## goal  \nLower case.", "Goal", "Lower case."),
        ("## Goal\n### Sub\ntext\n## Next", "Goal", "### Sub\ntext"),
        ("Intro\n### Goal\nDeep.\n## Next", "Goal", "Deep."),
        ("## Goal\n## Verify\nx", "Goal", "## Verify\nx"),
        ("## Goals\nNot it.\n", "Goal", ""),
        ("## Non-goals\n- a\n- b\n", "Non-goals", "- a\n- b"),
    ];
    for (body, heading, expected) in rows {
        assert_eq!(
            expected,
            section(body, heading),
            "section {heading:?} of {body:?}"
        );
    }
}
