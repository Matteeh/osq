//! Proves doctor's harness, version and containment lines for every harness.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The marker that tells the child which row to run.
const ROW_MARKER: &str = "OSQ_DOCTOR_HARNESS_ROW";
/// The test name the child runs.
const TEST: &str = "doctor_harness_lines";
/// The opencode row's `osq.toml`, with the fake program filled in.
const OPENCODE: &str = "[executor]\nharness = \"opencode\"\n\n[opencode]\nbin = \"<fake>\"";
/// The claude row's `osq.toml`, with the fake program filled in.
const CLAUDE: &str = "[executor]\nharness = \"claude\"\n\n[claude]\nbin = \"<fake>\"";
/// agy's containment failure.
const AGY: &str = "[fail] harness-containment: agy asks before every tool call and a headless task cannot answer; set agy.dangerouslySkipPermissions: true to accept that, or choose another harness";
/// opencode's default-agent containment line.
const CODER: &str = "[ok] harness-containment: osq-coder agent denies git, curl, wget, ssh, scp, sudo, and web tools; shell unconfined with open network";
/// claude's unconfined containment line.
const OPEN: &str = "[ok] harness-containment: file tools confined to the project; git denied; Bash unconfined with open network";
/// codex's containment line.
const CODEX: &str = "[ok] harness-containment: workspace-write sandbox: writes confined to the project, .git read-only, no network";
/// The missing agy program text.
const MISSING_AGY: &str = "cannot start /nonexistent/agy: No such file or directory (os error 2)";
/// The missing opencode program text.
const MISSING_OPENCODE: &str =
    "cannot start /nonexistent/opencode: No such file or directory (os error 2)";
/// The marker for a `PATH` holding no program.
const EMPTY_PATH: &str = "<empty>";

/// One row of "Doctor harness lines".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The `osq.toml` text, or none when the root has no file.
    config: Option<&'static str>,
    /// The variables added to the child's environment.
    vars: &'static [(&'static str, &'static str)],
    /// Files written in the root, each with a trailing newline.
    files: &'static [(&'static str, &'static str)],
    /// The lines before the managed-block line.
    expected: &'static [&'static str],
}

/// The rows of "Doctor harness lines", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "mock",
        config: Some("[executor]\nharness = \"mock\""),
        vars: &[],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: mock)",
            "[ok] harness: no external executable required",
            "[ok] harness-containment: no agent process",
        ],
    },
    Row {
        name: "agy-missing",
        config: None,
        vars: &[("AGY_PATH", "/nonexistent/agy")],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: agy)",
            "[fail] harness: binary unavailable: /nonexistent/agy (<missing agy>)",
            AGY,
        ],
    },
    Row {
        name: "agy-bypass",
        config: Some("[agy]\ndangerouslySkipPermissions = true"),
        vars: &[("AGY_PATH", "<fake>")],
        files: &[("fake-pi-version", "agy 1.3.5")],
        expected: &[
            "[ok] config: loaded (harness: agy)",
            "[ok] harness: <fake> agy 1.3.5",
            "[warn] harness-containment: agy.dangerouslySkipPermissions is true: agy approves every tool call, so nothing stops git, network tools, or sudo",
        ],
    },
    Row {
        name: "config-error",
        config: Some("[pi]\nbin = \"  \""),
        vars: &[("AGY_PATH", "/nonexistent/agy")],
        files: &[],
        expected: &[
            "[fail] config: failed to load: pi.bin must be a non-empty string",
            "[fail] harness: binary unavailable: /nonexistent/agy (<missing agy>)",
        ],
    },
    Row {
        name: "opencode-prefixed",
        config: Some(OPENCODE),
        vars: &[],
        files: &[("fake-pi-version", "opencode v2.0.18")],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[ok] harness: <fake> opencode v2.0.18",
            "[ok] harness-version: opencode 2.0.18 (tested >=2.0.0 <3.0.0)",
            CODER,
        ],
    },
    Row {
        name: "opencode-minimum",
        config: Some(OPENCODE),
        vars: &[],
        files: &[("fake-pi-version", "2.0.0")],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[ok] harness: <fake> 2.0.0",
            "[ok] harness-version: opencode 2.0.0 (tested >=2.0.0 <3.0.0)",
            CODER,
        ],
    },
    Row {
        name: "opencode-unsupported",
        config: Some(
            "[executor]\nharness = \"opencode\"\n\n[opencode]\nbin = \"/nonexistent/opencode\"\nagent = \"mine\"",
        ),
        vars: &[("OPENCODE_PATH", "<fake>")],
        files: &[("fake-pi-version", "1.9.0")],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[ok] harness: <fake> 1.9.0",
            "[fail] harness-version: opencode 1.9.0 is not supported; the opencode adapter needs opencode 2 (tested >=2.0.0 <3.0.0)",
            "[warn] harness-containment: opencode.agent is mine, not osq-coder: that agent's own permissions apply, not osq's denials",
        ],
    },
    Row {
        name: "opencode-above-range",
        config: Some(OPENCODE),
        vars: &[],
        files: &[("fake-pi-version", "3.0.0")],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[ok] harness: <fake> 3.0.0",
            "[warn] harness-version: opencode 3.0.0 is outside the tested range >=2.0.0 <3.0.0",
            CODER,
        ],
    },
    Row {
        name: "opencode-unreadable",
        config: Some(OPENCODE),
        vars: &[],
        files: &[("fake-pi-version", "nightly")],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[ok] harness: <fake> nightly",
            "[warn] harness-version: opencode nightly is outside the tested range >=2.0.0 <3.0.0",
            CODER,
        ],
    },
    Row {
        name: "opencode-missing",
        config: Some(
            "[executor]\nharness = \"opencode\"\n\n[opencode]\nbin = \"/nonexistent/opencode\"",
        ),
        vars: &[],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[fail] harness: binary unavailable: /nonexistent/opencode (<missing opencode>)",
            CODER,
        ],
    },
    Row {
        name: "claude-suffixed",
        config: Some(CLAUDE),
        vars: &[],
        files: &[("fake-pi-version", "2.1.302 (Claude Code)")],
        expected: &[
            "[ok] config: loaded (harness: claude)",
            "[ok] harness: <fake> 2.1.302 (Claude Code)",
            "[ok] harness-version: Claude Code 2.1.302 (Claude Code) (minimum 2.1.278)",
            OPEN,
        ],
    },
    Row {
        name: "claude-sandboxed",
        config: Some(
            "[executor]\nharness = \"claude\"\n\n[claude]\nbin = \"<fake>\"\nsandbox = true",
        ),
        vars: &[],
        files: &[("fake-pi-version", "2.1.278")],
        expected: &[
            "[ok] config: loaded (harness: claude)",
            "[ok] harness: <fake> 2.1.278",
            "[ok] harness-version: Claude Code 2.1.278 (minimum 2.1.278)",
            "[ok] harness-containment: file tools confined to the project; git denied; Bash sandboxed with no network",
        ],
    },
    Row {
        name: "claude-below-minimum",
        config: Some(CLAUDE),
        vars: &[],
        files: &[("fake-pi-version", "2.1.0")],
        expected: &[
            "[ok] config: loaded (harness: claude)",
            "[ok] harness: <fake> 2.1.0",
            "[fail] harness-version: Claude Code 2.1.0 is below the required 2.1.278",
            OPEN,
        ],
    },
    Row {
        name: "claude-unreadable",
        config: Some(CLAUDE),
        vars: &[],
        files: &[("fake-pi-version", "nightly")],
        expected: &[
            "[ok] config: loaded (harness: claude)",
            "[ok] harness: <fake> nightly",
            "[fail] harness-version: Claude Code nightly is below the required 2.1.278",
            OPEN,
        ],
    },
    Row {
        name: "agy-default",
        config: Some("[executor]\nharness = \"agy\""),
        vars: &[("PATH", EMPTY_PATH)],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: agy)",
            "[fail] harness: binary unavailable: agy (<missing agy program>)",
            AGY,
        ],
    },
    Row {
        name: "opencode-default",
        config: Some("[executor]\nharness = \"opencode\""),
        vars: &[("PATH", EMPTY_PATH)],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: opencode)",
            "[fail] harness: binary unavailable: opencode (<missing opencode program>)",
            CODER,
        ],
    },
    Row {
        name: "codex-default",
        config: Some("[executor]\nharness = \"codex\""),
        vars: &[("PATH", EMPTY_PATH)],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: codex)",
            "[fail] harness: binary unavailable: codex (<missing codex program>)",
            CODEX,
        ],
    },
    Row {
        name: "codex-whitespace",
        config: Some("[executor]\nharness = \"codex\""),
        vars: &[("PATH", EMPTY_PATH), ("CODEX_PATH", "   ")],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: codex)",
            "[fail] harness: binary unavailable: codex (<missing codex program>)",
            CODEX,
        ],
    },
    Row {
        name: "claude-default",
        config: Some("[executor]\nharness = \"claude\""),
        vars: &[("PATH", EMPTY_PATH)],
        files: &[],
        expected: &[
            "[ok] config: loaded (harness: claude)",
            "[fail] harness: binary unavailable: claude (<missing claude program>)",
            OPEN,
        ],
    },
    Row {
        name: "codex-setting",
        config: Some("[executor]\nharness = \"codex\"\n\n[codex]\nbin = \"<fake>\""),
        vars: &[("CODEX_PATH", "/nonexistent/codex")],
        files: &[("fake-pi-version", "codex-cli 0.50.0")],
        expected: &[
            "[ok] config: loaded (harness: codex)",
            "[ok] harness: <fake> codex-cli 0.50.0",
            CODEX,
        ],
    },
    Row {
        name: "codex-variable",
        config: Some("[executor]\nharness = \"codex\""),
        vars: &[("CODEX_PATH", "  <fake>  ")],
        files: &[("fake-pi-version", "codex-cli 0.50.0")],
        expected: &[
            "[ok] config: loaded (harness: codex)",
            "[ok] harness: <fake> codex-cli 0.50.0",
            CODEX,
        ],
    },
];

/// Returns the committed fake pi's absolute path.
fn fake_pi() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-pi/doctor.sh")
}

/// The row's scratch root under `CARGO_TARGET_TMPDIR`.
fn root(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// The managed files doctor checks, paired with their test fixture copies.
const MANAGED_FILES: [(&str, &str); 3] = [
    ("AGENTS.md", "agents-block.txt"),
    ("PLANNER.md", "planner-block.txt"),
    (".claude/commands/osq-plan.md", "claude-plan-command.txt"),
];

/// Writes the row's root, managed files and files.
fn build(end: &Row, fake: &Path) {
    let root = root(end.name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/managed");
    for (path, fixture) in MANAGED_FILES {
        let text = fs::read_to_string(fixtures.join(fixture)).expect("the managed fixture reads");
        write(&root.join(path), &format!("{text}\n"));
    }
    if let Some(config) = end.config {
        write(&root.join("osq.toml"), &expand(config, fake));
    }
    for (path, text) in end.files {
        write(&root.join(path), &format!("{text}\n"));
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Replaces the row's placeholders with their runtime text.
fn expand(text: &str, fake: &Path) -> String {
    text.replace("<fake>", &fake.to_string_lossy())
        .replace("<missing agy>", MISSING_AGY)
        .replace("<missing opencode>", MISSING_OPENCODE)
        .replace("<missing agy program>", &missing("agy"))
        .replace("<missing opencode program>", &missing("opencode"))
        .replace("<missing codex program>", &missing("codex"))
        .replace("<missing claude program>", &missing("claude"))
}

/// The start error for a bare program name no `PATH` entry holds.
fn missing(program: &str) -> String {
    format!("cannot start {program}: No such file or directory (os error 2)")
}

/// Runs doctor on a root and returns its output or its failure message.
fn doctor_text(root: &Path) -> String {
    match DoctorFeature.run(&Invocation::new(root, "doctor", Vec::new())) {
        Ok(output) => output.text,
        Err(FeatureError::Failed {
            command, message, ..
        }) => {
            assert_eq!("doctor", command);
            message
        }
        Err(other) => panic!("doctor returned {other:?}"),
    }
}

/// The lines before the managed-block line of a doctor result.
fn head_lines(text: &str) -> Vec<String> {
    text.lines()
        .take_while(|line| !line.contains("managed-blocks:"))
        .map(str::to_owned)
        .collect()
}

/// Finds the row with a name.
fn row(name: &str) -> &'static Row {
    ROWS.iter()
        .find(|row| row.name == name)
        .expect("the row is known")
}

/// Starts this test's child for one row with the harness variables removed.
fn spawn_child(end: &Row, fake: &Path) {
    let mut command = Command::new(std::env::current_exe().expect("the test binary is known"));
    command
        .args(["--exact", TEST, "--nocapture"])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .env(ROW_MARKER, end.name)
        .env_remove("AGY_PATH")
        .env_remove("OPENCODE_PATH")
        .env_remove("CODEX_PATH");
    let empty = root(end.name).join("empty-path");
    fs::create_dir_all(&empty).expect("the empty PATH folder is created");
    for (key, value) in end.vars {
        if *value == EMPTY_PATH {
            command.env(key, &empty);
        } else {
            command.env(key, expand(value, fake));
        }
    }
    let status = command.status().expect("the child starts");
    assert!(status.success(), "the child for {} fails", end.name);
}

/// Proves every row of "Doctor harness lines" in its own child process.
///
/// Covers: rust-doctor/doctor-harness-lines
#[test]
fn doctor_harness_lines() {
    let fake = fake_pi();
    if let Some(name) = std::env::var_os(ROW_MARKER) {
        let end = row(&name.to_string_lossy());
        let expected: Vec<String> = end
            .expected
            .iter()
            .map(|line| expand(line, &fake))
            .collect();
        assert_eq!(expected, head_lines(&doctor_text(&root(end.name))));
        return;
    }
    for end in ROWS {
        build(end, &fake);
        spawn_child(end, &fake);
    }
}
