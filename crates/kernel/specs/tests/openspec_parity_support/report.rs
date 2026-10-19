//! Comparing the Rust validator and the `OpenSpec` CLI for the parity tests.

/// What one side of one parity comparison decided.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// The side found nothing to fail on.
    Pass,
    /// The side failed, with one detail per finding or issue, possibly none.
    Fail(Vec<String>),
}

impl Outcome {
    /// Builds a pass for no details and a fail otherwise.
    #[must_use]
    pub fn from_details(details: Vec<String>) -> Self {
        if details.is_empty() {
            Self::Pass
        } else {
            Self::Fail(details)
        }
    }

    /// True when the side passed.
    #[must_use]
    pub fn passed(&self) -> bool {
        matches!(self, Self::Pass)
    }

    /// The detail lines, empty for a pass.
    #[must_use]
    pub fn details(&self) -> &[String] {
        match self {
            Self::Pass => &[],
            Self::Fail(details) => details,
        }
    }

    /// `pass` or `fail`.
    #[must_use]
    pub fn label(&self) -> &'static str {
        if self.passed() { "pass" } else { "fail" }
    }
}

/// One compared parity item.
#[derive(Debug, Clone)]
pub struct Comparison {
    /// The item's label, relative to the repository or the crate.
    pub label: String,
    /// The Rust validator's outcome.
    pub rust: Outcome,
    /// The `OpenSpec` CLI's outcome.
    pub openspec: Outcome,
}

/// A difference the Rust validator and the `OpenSpec` CLI are allowed to have.
#[derive(Debug, Clone)]
pub struct KnownDifference {
    /// The item's label.
    pub label: &'static str,
    /// True when the Rust side passes.
    pub rust_passes: bool,
    /// True when the `OpenSpec` side passes.
    pub openspec_passes: bool,
    /// Why the two sides differ.
    pub why: &'static str,
}

/// Asserts every comparison agrees, except the listed differences, which must
/// differ exactly as listed. Prints every failing item at once.
///
/// # Panics
///
/// Panics when an unlisted item disagrees, a listed difference no longer
/// holds, or a listed difference names an item that was not compared.
pub fn assert_parity(comparisons: &[Comparison], differences: &[KnownDifference]) {
    let failures = collect_failures(comparisons, differences);
    assert!(
        failures.is_empty(),
        "validate parity failures:\n{}",
        failures.join("\n")
    );
}

/// Every failure: each unlisted disagreement, each stale difference, and each
/// listed difference with no item.
fn collect_failures(comparisons: &[Comparison], differences: &[KnownDifference]) -> Vec<String> {
    let mut failures = Vec::new();
    for comparison in comparisons {
        match differences
            .iter()
            .find(|difference| difference.label == comparison.label)
        {
            None => {
                if comparison.rust.passed() != comparison.openspec.passed() {
                    failures.push(format!(
                        "unlisted difference:\n{}",
                        format_comparison(comparison)
                    ));
                }
            }
            Some(difference) => {
                if comparison.rust.passed() != difference.rust_passes
                    || comparison.openspec.passed() != difference.openspec_passes
                {
                    failures.push(format!(
                        "listed difference no longer holds ({}):\n{}",
                        difference.why,
                        format_comparison(comparison)
                    ));
                }
            }
        }
    }
    for difference in differences {
        if !comparisons
            .iter()
            .any(|comparison| comparison.label == difference.label)
        {
            failures.push(format!(
                "listed difference was not compared: `{}`",
                difference.label
            ));
        }
    }
    failures
}

/// The label, both outcomes, and both sides' details.
fn format_comparison(comparison: &Comparison) -> String {
    format!(
        "`{}`: rust {}, openspec {}\n  rust: {}\n  openspec: {}",
        comparison.label,
        comparison.rust.label(),
        comparison.openspec.label(),
        details_text(&comparison.rust),
        details_text(&comparison.openspec)
    )
}

/// One side's details, or a note that it has none.
fn details_text(outcome: &Outcome) -> String {
    if outcome.details().is_empty() {
        "(no details)".to_string()
    } else {
        outcome.details().join("; ")
    }
}
