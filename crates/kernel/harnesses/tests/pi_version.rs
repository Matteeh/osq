//! Pi preflight version tests: binary choices and the tested range.

use std::collections::BTreeMap;

use osq_kernel_harnesses::{PiVersionRange, assess_pi_version, resolve_pi_binary};

/// The range the version table tests against.
const RANGE: PiVersionRange = PiVersionRange {
    min: [0, 87, 0],
    max: [0, 88, 0],
};

/// The range's text, as the warnings spell it.
const RANGE_TEXT: &str = ">=0.87.0 <0.88.0";

/// One row of the "Binary choices" table.
struct BinaryRow {
    /// The row's name.
    name: &'static str,
    /// The configured setting, or none.
    setting: Option<&'static str>,
    /// The environment's `OSQ_PI_PATH`, or none when unset.
    path: Option<&'static str>,
    /// The program the row expects.
    program: &'static str,
}

/// The rows of the "Binary choices" table, in table order.
const BINARY_ROWS: &[BinaryRow] = &[
    BinaryRow {
        name: "trimmed-setting-wins",
        setting: Some("  /opt/pi/bin/pi  "),
        path: Some("/env/pi"),
        program: "/opt/pi/bin/pi",
    },
    BinaryRow {
        name: "blank-setting-falls-back-to-trimmed-environment",
        setting: Some("   "),
        path: Some(" /env/pi "),
        program: "/env/pi",
    },
    BinaryRow {
        name: "no-setting-uses-environment",
        setting: None,
        path: Some("/env/pi"),
        program: "/env/pi",
    },
    BinaryRow {
        name: "blank-environment-falls-back-to-pi",
        setting: None,
        path: Some("  "),
        program: "pi",
    },
    BinaryRow {
        name: "no-environment-falls-back-to-pi",
        setting: None,
        path: None,
        program: "pi",
    },
];

/// One row of the "Versions against the tested range" table.
struct VersionRow {
    /// The row's name.
    name: &'static str,
    /// The text `pi --version` wrote.
    text: &'static str,
    /// The expected trimmed version text.
    version: &'static str,
    /// Whether the version is tested.
    tested: bool,
    /// The expected warning, or none.
    warning: Option<&'static str>,
}

/// The rows of the "Versions against the tested range" table, in table order.
const VERSION_ROWS: &[VersionRow] = &[
    VersionRow {
        name: "minimum-version-is-tested",
        text: "0.87.3\n",
        version: "0.87.3",
        tested: true,
        warning: None,
    },
    VersionRow {
        name: "first-line-is-trimmed",
        text: "  pi 0.87.0 (build 5)\nextra",
        version: "pi 0.87.0 (build 5)",
        tested: true,
        warning: None,
    },
    VersionRow {
        name: "prerelease-suffix-is-ignored-for-the-run",
        text: "v0.87.12-beta",
        version: "v0.87.12-beta",
        tested: true,
        warning: None,
    },
    VersionRow {
        name: "maximum-version-is-outside",
        text: "0.88.0",
        version: "0.88.0",
        tested: false,
        warning: Some("Pi 0.88.0 is outside the tested range >=0.87.0 <0.88.0"),
    },
    VersionRow {
        name: "below-the-minimum-is-outside",
        text: "0.86.99",
        version: "0.86.99",
        tested: false,
        warning: Some("Pi 0.86.99 is outside the tested range >=0.87.0 <0.88.0"),
    },
    VersionRow {
        name: "lower-minor-is-outside",
        text: "0.9.0",
        version: "0.9.0",
        tested: false,
        warning: Some("Pi 0.9.0 is outside the tested range >=0.87.0 <0.88.0"),
    },
    VersionRow {
        name: "higher-major-is-outside",
        text: "1.0.0",
        version: "1.0.0",
        tested: false,
        warning: Some("Pi 1.0.0 is outside the tested range >=0.87.0 <0.88.0"),
    },
    VersionRow {
        name: "two-parts-have-no-version-run",
        text: "1.2",
        version: "1.2",
        tested: false,
        warning: Some("Pi version \"1.2\" is outside the tested range >=0.87.0 <0.88.0"),
    },
    VersionRow {
        name: "empty-text-has-no-version-run",
        text: "",
        version: "",
        tested: false,
        warning: Some("Pi version \"\" is outside the tested range >=0.87.0 <0.88.0"),
    },
    VersionRow {
        name: "part-too-large-for-u64-has-no-version-run",
        text: "0.99999999999999999999.0",
        version: "0.99999999999999999999.0",
        tested: false,
        warning: Some(
            "Pi version \"0.99999999999999999999.0\" is outside the tested range >=0.87.0 <0.88.0",
        ),
    },
];

/// Covers: rust-harnesses/binary-choices
#[test]
fn binary_choices() {
    for row in BINARY_ROWS {
        let mut env = BTreeMap::new();
        if let Some(path) = row.path {
            env.insert("OSQ_PI_PATH".to_owned(), path.to_owned());
        }
        assert_eq!(
            row.program,
            resolve_pi_binary(row.setting, &env),
            "row {}",
            row.name
        );
    }
}

/// Covers: rust-harnesses/versions-against-the-tested-range
#[test]
fn versions_against_the_tested_range() {
    assert_eq!(RANGE_TEXT, RANGE.to_string(), "row range-text");
    for row in VERSION_ROWS {
        let assessment = assess_pi_version(row.text, RANGE);
        assert_eq!(row.version, assessment.version, "row {}", row.name);
        assert_eq!(row.tested, assessment.tested, "row {}", row.name);
        assert_eq!(
            row.warning.map(str::to_owned),
            assessment.warning,
            "row {}",
            row.name
        );
    }
}
