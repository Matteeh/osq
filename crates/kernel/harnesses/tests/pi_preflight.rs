//! Pi preflight tests: a fake pi and a binary that cannot start.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use osq_kernel_harnesses::{PiPreflight, PiPreflightError, PiVersionRange, preflight_pi};

/// The range every row tests against.
const RANGE: PiVersionRange = PiVersionRange {
    min: [0, 87, 0],
    max: [0, 88, 0],
};

/// The longest a row may take before the test calls preflight stuck.
const ROW_LIMIT: Duration = Duration::from_secs(5);

/// The timeout every row gives both programs.
const TIMEOUT: Duration = Duration::from_secs(2);

/// The grace every row gives the process runner.
const KILL_GRACE: Duration = Duration::from_millis(300);

/// A counter that keeps each row's temporary folder apart.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// What one row expects preflight to return.
enum Expected {
    /// A ready result with a version and optional warning.
    Ready {
        /// The version text preflight reports.
        version: &'static str,
        /// The warning preflight reports, or none.
        warning: Option<&'static str>,
    },
    /// The binary failed its version probe.
    Binary,
    /// The credentials check failed with this detail.
    Credentials(&'static str),
}

/// One row of the "Preflight with a fake pi" table.
struct Row {
    /// The row's name.
    name: &'static str,
    /// The provider given to preflight, or none.
    provider: Option<&'static str>,
    /// The only variables the fake sees.
    vars: &'static [(&'static str, &'static str)],
    /// The result the row expects.
    expected: Expected,
}

/// The rows of the "Preflight with a fake pi" table, in table order.
const ROWS: &[Row] = &[
    Row {
        name: "no-provider-probes-version-only",
        provider: None,
        vars: &[("FAKE_PI_VERSION", "0.87.1")],
        expected: Expected::Ready {
            version: "0.87.1",
            warning: None,
        },
    },
    Row {
        name: "blank-provider-runs-no-auth-check",
        provider: Some("   "),
        vars: &[("FAKE_PI_VERSION", "0.87.1"), ("FAKE_PI_AUTH_EXIT", "1")],
        expected: Expected::Ready {
            version: "0.87.1",
            warning: None,
        },
    },
    Row {
        name: "untested-version-returns-a-warning",
        provider: None,
        vars: &[("FAKE_PI_VERSION", "0.90.0")],
        expected: Expected::Ready {
            version: "0.90.0",
            warning: Some("Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0"),
        },
    },
    Row {
        name: "version-falls-back-to-stderr",
        provider: None,
        vars: &[("FAKE_PI_VERSION_STDERR", "0.87.2")],
        expected: Expected::Ready {
            version: "0.87.2",
            warning: None,
        },
    },
    Row {
        name: "empty-version-warns-with-quotes",
        provider: None,
        vars: &[],
        expected: Expected::Ready {
            version: "",
            warning: Some("Pi version \"\" is outside the tested range >=0.87.0 <0.88.0"),
        },
    },
    Row {
        name: "version-probe-exit-fails-the-binary",
        provider: None,
        vars: &[("FAKE_PI_VERSION", "0.87.1"), ("FAKE_PI_VERSION_EXIT", "2")],
        expected: Expected::Binary,
    },
    Row {
        name: "trimmed-provider-runs-auth-check",
        provider: Some(" deepseek "),
        vars: &[
            ("FAKE_PI_VERSION", "0.87.1"),
            (
                "FAKE_PI_AUTH",
                "{\"status\":\"ready\",\"provider\":\"deepseek\"}",
            ),
        ],
        expected: Expected::Ready {
            version: "0.87.1",
            warning: None,
        },
    },
    Row {
        name: "auth-reason-is-reported",
        provider: Some("deepseek"),
        vars: &[
            ("FAKE_PI_VERSION", "0.87.1"),
            (
                "FAKE_PI_AUTH",
                "{\"status\":\"missing\",\"reason\":\"No API key found for deepseek\"}",
            ),
            ("FAKE_PI_AUTH_EXIT", "1"),
        ],
        expected: Expected::Credentials("No API key found for deepseek"),
    },
    Row {
        name: "blank-auth-reason-falls-back-to-status",
        provider: Some("deepseek"),
        vars: &[
            ("FAKE_PI_VERSION", "0.87.1"),
            ("FAKE_PI_AUTH", "{\"status\":\"expired\",\"reason\":\"  \"}"),
            ("FAKE_PI_AUTH_EXIT", "2"),
        ],
        expected: Expected::Credentials("expired"),
    },
    Row {
        name: "auth-that-is-not-json-is-unknown",
        provider: Some("deepseek"),
        vars: &[("FAKE_PI_VERSION", "0.87.1"), ("FAKE_PI_AUTH", "not json")],
        expected: Expected::Credentials("unknown"),
    },
    Row {
        name: "auth-array-is-not-an-object",
        provider: Some("deepseek"),
        vars: &[
            ("FAKE_PI_VERSION", "0.87.1"),
            ("FAKE_PI_AUTH", "[\"ready\"]"),
        ],
        expected: Expected::Credentials("unknown"),
    },
    Row {
        name: "auth-exit-names-the-code",
        provider: Some("deepseek"),
        vars: &[("FAKE_PI_VERSION", "0.87.1"), ("FAKE_PI_AUTH_EXIT", "3")],
        expected: Expected::Credentials("pi auth check exited with code 3"),
    },
    Row {
        name: "auth-wait-times-out",
        provider: Some("deepseek"),
        vars: &[("FAKE_PI_VERSION", "0.87.1"), ("FAKE_PI_AUTH_WAIT", "1")],
        expected: Expected::Credentials("pi auth check timed out"),
    },
];

/// Creates a fresh temporary folder under the crate's target folder.
fn temporary_folder(name: &str) -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::SeqCst);
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("pi_preflight")
        .join(format!("{name}-{number}"));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the temporary folder is created");
    folder
}

/// Builds one row's request with exactly its variables.
fn request(row: &Row, folder: &Path, bin: &Path) -> PiPreflight {
    let env = row
        .vars
        .iter()
        .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
        .collect::<BTreeMap<_, _>>();
    PiPreflight {
        bin: bin.to_string_lossy().into_owned(),
        provider: row.provider.map(str::to_owned),
        cwd: folder.to_path_buf(),
        env,
        timeout: TIMEOUT,
        kill_grace: KILL_GRACE,
        range: RANGE,
    }
}

/// Returns the provider preflight should trim and use, when there is one.
fn auth_provider(row: &Row) -> Option<&str> {
    row.provider
        .map(str::trim)
        .filter(|provider| !provider.is_empty())
}

/// Checks one row's result and whether it ran an auth check.
fn check_row(row: &Row, folder: &Path, bin: &Path) {
    let result = preflight_pi(request(row, folder, bin));
    let auth_file = folder.join("auth-args.txt");
    if auth_provider(row).is_none() {
        assert!(
            !auth_file.exists(),
            "row {} wrote an auth-args.txt without a provider",
            row.name
        );
    }
    match row.expected {
        Expected::Ready { version, warning } => {
            let ready = result.unwrap_or_else(|error| {
                panic!("row {} failed with {error}", row.name);
            });
            assert_eq!(version, ready.version, "row {}", row.name);
            assert_eq!(
                warning.map(str::to_owned),
                ready.warning,
                "row {}",
                row.name
            );
        }
        Expected::Binary => {
            let error = result.expect_err("the row's version probe fails");
            assert!(
                matches!(&error, PiPreflightError::Binary { bin: named } if named == &bin.to_string_lossy()),
                "row {} returned {error}",
                row.name
            );
            let text = format!("Pi binary not found or failed: {}", bin.to_string_lossy());
            assert_eq!(text, error.to_string(), "row {}", row.name);
        }
        Expected::Credentials(detail) => {
            let error = result.expect_err("the row's auth check is not ready");
            let (provider, actual_detail) = match &error {
                PiPreflightError::Credentials { provider, detail } => (provider, detail),
                PiPreflightError::Binary { .. } => {
                    panic!("row {} failed the binary probe with {error}", row.name);
                }
            };
            let expected_provider = auth_provider(row).expect("the row names a provider");
            assert_eq!(expected_provider, provider, "row {}", row.name);
            assert_eq!(detail, actual_detail, "row {}", row.name);
            let text = format!(
                "Pi credentials not ready for provider {provider}: {actual_detail}. Run: pi auth check --provider {provider}"
            );
            assert_eq!(text, error.to_string(), "row {}", row.name);
        }
    }
}

/// Covers: rust-harnesses/preflight-with-a-fake-pi
#[test]
fn preflight_with_a_fake_pi() {
    let bin = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-pi/preflight.sh");
    for row in ROWS {
        let folder = temporary_folder(row.name);
        let started = Instant::now();
        check_row(row, &folder, &bin);
        let elapsed = started.elapsed();
        assert!(elapsed < ROW_LIMIT, "row {} took {elapsed:?}", row.name);
        if let Some(provider) = auth_provider(row) {
            let args = fs::read_to_string(folder.join("auth-args.txt"))
                .expect("the auth check wrote its arguments");
            let lines: Vec<&str> = args.lines().collect();
            assert_eq!(
                vec!["auth", "check", "--provider", provider, "--json"],
                lines,
                "row {}",
                row.name
            );
        }
    }
}

/// Covers: rust-harnesses/pi-binary-that-cannot-start
#[test]
fn pi_binary_that_cannot_start() {
    let folder = temporary_folder("missing");
    let result = preflight_pi(PiPreflight {
        bin: "/nonexistent/pi".to_owned(),
        provider: None,
        cwd: folder,
        env: BTreeMap::new(),
        timeout: TIMEOUT,
        kill_grace: KILL_GRACE,
        range: RANGE,
    });
    let error = result.expect_err("a missing program cannot start");
    let _: &dyn std::error::Error = &error;
    assert!(matches!(&error, PiPreflightError::Binary { bin } if bin == "/nonexistent/pi"));
    assert_eq!(
        "Pi binary not found or failed: /nonexistent/pi",
        error.to_string()
    );
}
