//! Pi harness tests: the version preflight read for the program.

use std::time::Duration;

use osq_kernel_harnesses::{PiHarness, PiReady, PiSettings};
use osq_kernel_runners::Harness;

/// The grace every harness here would give a start.
const KILL_GRACE: Duration = Duration::from_millis(300);

/// Builds a preflight result with a version and an optional warning.
fn ready(version: &str, warning: Option<&str>) -> PiReady {
    PiReady {
        version: version.to_owned(),
        warning: warning.map(str::to_owned),
    }
}

/// Covers: rust-harnesses/pi-harness-version
#[test]
fn pi_harness_version() {
    let rows = [
        ("no preflight", None, None),
        ("plain version", Some(ready("0.87.1", None)), Some("0.87.1")),
        (
            "version with a warning",
            Some(ready("pi 9.0.0", Some("outside"))),
            Some("pi 9.0.0"),
        ),
        ("empty version", Some(ready("", Some("outside"))), None),
        ("blank version", Some(ready("   ", None)), None),
    ];
    for (name, preflight, expected) in rows {
        let mut harness = PiHarness::new("pi".to_owned(), PiSettings::default(), KILL_GRACE);
        if let Some(ready) = preflight {
            harness = harness.with_preflight(&ready);
        }
        assert_eq!(
            expected.map(str::to_owned),
            harness.harness_version(),
            "row {name}"
        );
    }
}
