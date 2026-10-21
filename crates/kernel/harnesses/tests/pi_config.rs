//! Pi harness tests: building a harness straight from `osq.toml`.

use std::collections::BTreeMap;
use std::time::Duration;

use osq_kernel_config::parse_config;
use osq_kernel_harnesses::{PiHarness, PiSettings};

/// The variable a row may set for the pi program.
const PI_PATH_VARIABLE: &str = "OSQ_PI_PATH";

/// One row of the "Pi harness built from osq.toml" table.
struct Row {
    /// The row's name.
    name: &'static str,
    /// The `osq.toml` text.
    text: &'static str,
    /// The row's `OSQ_PI_PATH`, or none.
    env_path: Option<&'static str>,
    /// The expected program.
    program: &'static str,
    /// The expected provider.
    provider: Option<&'static str>,
    /// The expected model.
    model: Option<&'static str>,
    /// The expected thinking level.
    thinking: Option<&'static str>,
    /// The expected kill grace.
    kill_grace: Duration,
}

/// The rows of the "Pi harness built from osq.toml" table, in table order.
const ROWS: &[Row] = &[
    Row {
        name: "empty",
        text: "",
        env_path: None,
        program: "pi",
        provider: None,
        model: None,
        thinking: None,
        kill_grace: Duration::from_millis(5000),
    },
    Row {
        name: "empty with OSQ_PI_PATH",
        text: "",
        env_path: Some("/env/pi"),
        program: "/env/pi",
        provider: None,
        model: None,
        thinking: None,
        kill_grace: Duration::from_millis(5000),
    },
    Row {
        name: "every pi key",
        text: "[pi]\nbin = \"/opt/pi/bin/pi\"\nprovider = \"deepseek\"\nmodel = \"deepseek/deepseek-flash\"\nthinking = \"high\"",
        env_path: Some("/env/pi"),
        program: "/opt/pi/bin/pi",
        provider: Some("deepseek"),
        model: Some("deepseek/deepseek-flash"),
        thinking: Some("high"),
        kill_grace: Duration::from_millis(5000),
    },
    Row {
        name: "model and kill grace",
        text: "[pi]\nmodel = \"m1\"\n[timeouts]\nharnessKillGracePeriodMs = 300",
        env_path: None,
        program: "pi",
        provider: None,
        model: Some("m1"),
        thinking: None,
        kill_grace: Duration::from_millis(300),
    },
];

/// Covers: rust-harnesses/pi-harness-built-from-osq-toml
#[test]
fn pi_harness_built_from_osq_toml() {
    for row in ROWS {
        let config = parse_config(row.text).expect("row text is valid");
        let env = match row.env_path {
            Some(path) => BTreeMap::from([(PI_PATH_VARIABLE.to_owned(), path.to_owned())]),
            None => BTreeMap::new(),
        };
        let settings = PiSettings {
            provider: row.provider.map(str::to_owned),
            model: row.model.map(str::to_owned),
            thinking: row.thinking.map(str::to_owned),
        };
        assert_eq!(
            PiHarness::new(row.program.to_owned(), settings, row.kill_grace),
            PiHarness::from_config(&config, &env),
            "row {}",
            row.name
        );
    }
}
