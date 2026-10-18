//! Document parser tests: sidecars.

use osq_kernel_specs::{Sidecar, SidecarError, parse_sidecar};

/// The expected result of one "Sidecar parsing" row.
#[derive(Debug)]
enum SidecarRow {
    /// The sidecar's trimmed group and tags.
    Parsed(&'static str, Option<&'static [&'static str]>),
    /// The problems, in order.
    Problems(&'static [&'static str]),
    /// A syntax error at a 1-based line.
    Syntax(usize),
}

/// Covers: rust-specs/sidecar-parsing
#[test]
fn sidecar_parsing() {
    let rows = [
        ("group: rust\n", SidecarRow::Parsed("rust", None)),
        (
            "group: \" x \"\ntags: [a, \" b \"]\n",
            SidecarRow::Parsed("x", Some(&["a", "b"])),
        ),
        ("tags: []\ngroup: g\n", SidecarRow::Parsed("g", Some(&[]))),
        (
            "group: \"\"\ntags: [a, \"\"]\nextra: 1\nother: 2\n",
            SidecarRow::Problems(&[
                "group must be a non-empty string",
                "tags must be a list of non-empty strings",
                "unknown key extra",
                "unknown key other",
            ]),
        ),
        ("- a\n", SidecarRow::Problems(&["not a YAML mapping"])),
        ("", SidecarRow::Problems(&["not a YAML mapping"])),
        ("group: [\n", SidecarRow::Syntax(2)),
    ];
    for (text, expected) in rows {
        match (parse_sidecar(text), expected) {
            (Ok(sidecar), SidecarRow::Parsed(group, tags)) => {
                assert_eq!(
                    Sidecar {
                        group: group.to_string(),
                        tags: tags.map(strings),
                    },
                    sidecar,
                    "sidecar {text:?}"
                );
            }
            (Err(SidecarError::Problems(problems)), SidecarRow::Problems(expected)) => {
                assert_eq!(strings(expected), problems, "problems of {text:?}");
            }
            (Err(SidecarError::Syntax(error)), SidecarRow::Syntax(line)) => {
                assert_eq!(line, error.line, "line of {text:?}");
            }
            (other, _) => panic!("unexpected {other:?} for {text:?}"),
        }
    }
}

/// The owned texts of a slice of string literals.
fn strings(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_string()).collect()
}
