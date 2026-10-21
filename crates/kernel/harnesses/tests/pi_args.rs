//! Pi argument tests: the base flags and each settings row of the table.

use osq_kernel_harnesses::{PiSettings, pi_args};

/// The prompt every row appends as one argument.
const PROMPT: &str = "Do task 1.\nThen exit.";

/// The eight flags every run starts with.
const BASE: &[&str] = &[
    "--mode",
    "json",
    "--no-session",
    "--no-approve",
    "--offline",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
];

/// One row of the "Arguments for pi settings" table.
struct Row {
    /// The provider setting, or none.
    provider: Option<&'static str>,
    /// The model setting, or none.
    model: Option<&'static str>,
    /// The thinking setting, or none.
    thinking: Option<&'static str>,
    /// The arguments after the base flags.
    rest: &'static [&'static str],
}

/// Builds the expected arguments for one row.
fn expected(rest: &[&str]) -> Vec<String> {
    BASE.iter()
        .copied()
        .chain(rest.iter().copied())
        .map(str::to_owned)
        .collect()
}

/// Covers: rust-harnesses/arguments-for-pi-settings
#[test]
fn arguments_for_pi_settings() {
    let rows = [
        Row {
            provider: None,
            model: None,
            thinking: None,
            rest: &["--", PROMPT],
        },
        Row {
            provider: Some("deepseek"),
            model: Some("deepseek-flash"),
            thinking: Some("high"),
            rest: &[
                "--provider",
                "deepseek",
                "--model",
                "deepseek-flash",
                "--thinking",
                "high",
                "--",
                PROMPT,
            ],
        },
        Row {
            provider: Some("  deepseek  "),
            model: Some(""),
            thinking: Some("   "),
            rest: &["--provider", "deepseek", "--", PROMPT],
        },
        Row {
            provider: None,
            model: Some("m1"),
            thinking: None,
            rest: &["--model", "m1", "--", PROMPT],
        },
    ];
    for row in rows {
        let settings = PiSettings {
            provider: row.provider.map(str::to_owned),
            model: row.model.map(str::to_owned),
            thinking: row.thinking.map(str::to_owned),
        };
        assert_eq!(pi_args(&settings, PROMPT), expected(row.rest));
    }
}
