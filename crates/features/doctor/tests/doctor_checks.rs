//! Proves doctor's configuration and pi check lines against the fake pi.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The longest a doctor row may take.
const ROW_LIMIT: Duration = Duration::from_secs(5);

/// Runs pi without a provider.
const PI_CONFIG: &str = r#"[executor]
harness = "pi"

[pi]
bin = "<fake>""#;

/// Runs pi for a configured provider.
const PI_PROVIDER_CONFIG: &str = r#"[executor]
harness = "pi"

[pi]
bin = "<fake>"
provider = "deepseek""#;

/// Runs pi with a one-second preflight timeout and a short kill grace.
const PI_TIMEOUT_CONFIG: &str = r#"[executor]
harness = "pi"

[pi]
bin = "<fake>"

[timeouts]
harnessPreflightSeconds = 1
harnessKillGracePeriodMs = 100"#;

/// What one row expects doctor to return.
enum Expected {
    /// Success with exactly this text.
    Output(&'static str),
    /// Failure with exactly this message.
    Failed(&'static str),
}

/// One row of "Doctor checks with a fake pi".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The `osq.toml` text, or none when the root has no file.
    config: Option<&'static str>,
    /// Files written in the root, each with a trailing newline unless empty.
    files: &'static [(&'static str, &'static str)],
    /// What doctor returns for the row.
    expected: Expected,
}

/// The rows of "Doctor checks with a fake pi", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "config-defaults",
        config: None,
        files: &[],
        expected: Expected::Output("[ok] config: loaded (harness: agy)\n"),
    },
    Row {
        name: "blank-pi-bin",
        config: Some("[pi]\nbin = \"  \""),
        files: &[],
        expected: Expected::Failed(
            "[fail] config: failed to load: pi.bin must be a non-empty string",
        ),
    },
    Row {
        name: "tested-version",
        config: Some(PI_CONFIG),
        files: &[("fake-pi-version", "0.87.1")],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.87.1\n",
            "[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n",
        )),
    },
    Row {
        name: "untested-version",
        config: Some(PI_CONFIG),
        files: &[("fake-pi-version", "0.90.0")],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.90.0\n",
            "[warn] harness-version: Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0\n",
        )),
    },
    Row {
        name: "version-from-stderr",
        config: Some(PI_CONFIG),
        files: &[("fake-pi-version-stderr", "0.87.2")],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.87.2\n",
            "[ok] harness-version: Pi 0.87.2 (tested >=0.87.0 <0.88.0)\n",
        )),
    },
    Row {
        name: "missing-version",
        config: Some(PI_CONFIG),
        files: &[],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake>\n",
            "[warn] harness-version: Pi version \"\" is outside the tested range >=0.87.0 <0.88.0\n",
        )),
    },
    Row {
        name: "version-exit-code",
        config: Some(PI_CONFIG),
        files: &[("fake-pi-version", "0.87.1"), ("fake-pi-version-exit", "2")],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[fail] harness: binary unavailable: <fake> (exited with code 2)",
        )),
    },
    Row {
        name: "missing-binary",
        config: Some("[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"/nonexistent/pi\""),
        files: &[],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[fail] harness: binary unavailable: /nonexistent/pi ",
            "(cannot start /nonexistent/pi: No such file or directory (os error 2))",
        )),
    },
    Row {
        name: "version-timeout",
        config: Some(PI_TIMEOUT_CONFIG),
        files: &[("fake-pi-version-wait", "")],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[fail] harness: binary unavailable: <fake> (timed out)",
        )),
    },
    Row {
        name: "auth-ready",
        config: Some(PI_PROVIDER_CONFIG),
        files: &[
            ("fake-pi-version", "0.87.1"),
            (
                "fake-pi-auth",
                r#"{"status":"ready","provider":"deepseek"}"#,
            ),
        ],
        expected: Expected::Output(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.87.1\n",
            "[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n",
            "[ok] harness-auth: deepseek credentials ready\n",
        )),
    },
    Row {
        name: "auth-missing",
        config: Some(PI_PROVIDER_CONFIG),
        files: &[
            ("fake-pi-version", "0.87.1"),
            (
                "fake-pi-auth",
                r#"{"status":"missing","reason":"No API key found for deepseek"}"#,
            ),
            ("fake-pi-auth-exit", "1"),
        ],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.87.1\n",
            "[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n",
            "[fail] harness-auth: deepseek credentials not ready: No API key found for deepseek",
        )),
    },
    Row {
        name: "auth-exit",
        config: Some(PI_PROVIDER_CONFIG),
        files: &[("fake-pi-version", "0.90.0"), ("fake-pi-auth-exit", "3")],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.90.0\n",
            "[warn] harness-version: Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0\n",
            "[fail] harness-auth: deepseek credentials not ready: pi auth check exited with code 3",
        )),
    },
    Row {
        name: "auth-version-once",
        config: Some(PI_PROVIDER_CONFIG),
        files: &[("fake-pi-version", "0.87.1"), ("fake-pi-version-once", "")],
        expected: Expected::Failed(concat!(
            "[ok] config: loaded (harness: pi)\n",
            "[ok] harness: <fake> 0.87.1\n",
            "[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n",
            "[fail] harness-auth: deepseek credentials not ready: ",
            "Pi binary not found or failed: <fake>",
        )),
    },
];

/// Returns the committed fake pi's absolute path.
fn fake_pi() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-pi/doctor.sh")
}

/// Creates the row's fresh scratch root under `CARGO_TARGET_TMPDIR`.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one row file, with a trailing newline unless the row calls it empty.
fn write_file(path: &Path, content: &str) {
    let text = if content.is_empty() {
        String::new()
    } else {
        format!("{content}\n")
    };
    fs::write(path, text).unwrap_or_else(|error| panic!("{} is written: {error}", path.display()));
}

/// Replaces the fake pi placeholder with its absolute path.
fn substitute(text: &str, fake: &Path) -> String {
    text.replace("<fake>", &fake.to_string_lossy())
}

/// Checks one row's result against its expected text.
fn check_row(row: &Row, fake: &Path, result: Result<osq_core::Output, FeatureError>) {
    match row.expected {
        Expected::Output(text) => {
            let output = result.unwrap_or_else(|error| panic!("row {} failed: {error}", row.name));
            assert_eq!(substitute(text, fake), output.text, "row {}", row.name);
        }
        Expected::Failed(text) => {
            let error = result.expect_err("the row's check fails");
            match &error {
                FeatureError::Failed {
                    command, message, ..
                } => {
                    assert_eq!("doctor", command, "row {}", row.name);
                    assert_eq!(substitute(text, fake), *message, "row {}", row.name);
                }
                other => panic!("row {} returned {other:?}", row.name),
            }
        }
    }
}

/// Proves every row of "Doctor checks with a fake pi".
///
/// Covers: rust-doctor/doctor-checks-with-a-fake-pi
#[test]
fn doctor_checks_with_a_fake_pi() {
    let fake = fake_pi();
    let feature = DoctorFeature;
    for row in ROWS {
        let root = scratch(row.name);
        if let Some(config) = row.config {
            write_file(&root.join("osq.toml"), &substitute(config, &fake));
        }
        for (name, content) in row.files {
            write_file(&root.join(name), content);
        }
        let started = Instant::now();
        let result = feature.run(&Invocation::new(&root, "doctor", Vec::new()));
        let elapsed = started.elapsed();
        assert!(elapsed < ROW_LIMIT, "row {} took {elapsed:?}", row.name);
        check_row(row, &fake, result);
    }
}

/// Proves the fake pi is committed executable and runs in place.
///
/// Covers: rust-doctor/doctor-fake-pi-runs-in-place
#[test]
fn doctor_fake_pi_runs_in_place() {
    let fake = fake_pi();
    let mode = fs::metadata(&fake)
        .expect("the fake pi exists")
        .permissions()
        .mode();
    assert_eq!(0o111, mode & 0o111, "{} is executable", fake.display());
}
