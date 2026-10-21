//! Role environment tests: the table's rows and every base name.

use std::collections::BTreeMap;

use osq_kernel_runners::{BASE_ENV_NAMES, EnvRole, role_env};

/// One row of the "Role environments" table.
struct Row {
    /// The role whose environment is built.
    role: EnvRole,
    /// The source variables.
    source: &'static [(&'static str, &'static str)],
    /// The names the settings configure for the role.
    configured: &'static [&'static str],
    /// The names the harness reads for its model.
    agent_env: &'static [&'static str],
    /// The extra variables set last.
    extra: &'static [(&'static str, &'static str)],
    /// The variables the result holds.
    result: &'static [(&'static str, &'static str)],
}

/// Builds a string map from literal pairs.
fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
        .collect()
}

/// Builds a name list from literals.
fn names(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| (*name).to_owned()).collect()
}

/// The "Role environments" table.
const ROWS: [Row; 10] = [
    Row {
        role: EnvRole::Verify,
        source: &[
            ("PATH", "/bin"),
            ("HOME", "/h"),
            ("OSQ_FAKE_MODE", "1"),
            ("AWS_SECRET_ACCESS_KEY", "s"),
        ],
        configured: &[],
        agent_env: &[],
        extra: &[],
        result: &[("HOME", "/h"), ("OSQ_FAKE_MODE", "1"), ("PATH", "/bin")],
    },
    Row {
        role: EnvRole::Verify,
        source: &[("DATABASE_URL", "d")],
        configured: &["DATABASE_URL"],
        agent_env: &[],
        extra: &[],
        result: &[("DATABASE_URL", "d")],
    },
    Row {
        role: EnvRole::Prepare,
        source: &[("DATABASE_URL", "d")],
        configured: &[],
        agent_env: &[],
        extra: &[],
        result: &[],
    },
    Row {
        role: EnvRole::Agent,
        source: &[("ANTHROPIC_API_KEY", "a"), ("OPENAI_API_KEY", "o")],
        configured: &[],
        agent_env: &["ANTHROPIC_API_KEY"],
        extra: &[],
        result: &[("ANTHROPIC_API_KEY", "a")],
    },
    Row {
        role: EnvRole::Verify,
        source: &[("ANTHROPIC_API_KEY", "a")],
        configured: &["ANTHROPIC_API_KEY"],
        agent_env: &["ANTHROPIC_API_KEY"],
        extra: &[],
        result: &[],
    },
    Row {
        role: EnvRole::Prepare,
        source: &[("ANTHROPIC_API_KEY", "a")],
        configured: &["ANTHROPIC_API_KEY"],
        agent_env: &["ANTHROPIC_API_KEY"],
        extra: &[],
        result: &[],
    },
    Row {
        role: EnvRole::Agent,
        source: &[("ANTHROPIC_API_KEY", "a")],
        configured: &["ANTHROPIC_API_KEY"],
        agent_env: &["ANTHROPIC_API_KEY"],
        extra: &[],
        result: &[("ANTHROPIC_API_KEY", "a")],
    },
    Row {
        role: EnvRole::Agent,
        source: &[("AGENT_PROBE", "p"), ("SECRET_PROBE", "s")],
        configured: &["AGENT_PROBE"],
        agent_env: &[],
        extra: &[],
        result: &[("AGENT_PROBE", "p")],
    },
    Row {
        role: EnvRole::Agent,
        source: &[("OSQ_TASK_NUMBER", "9")],
        configured: &[],
        agent_env: &[],
        extra: &[("OSQ_TASK_NUMBER", "1"), ("OSQ_SPEC_FOLDER", "f")],
        result: &[("OSQ_SPEC_FOLDER", "f"), ("OSQ_TASK_NUMBER", "1")],
    },
    Row {
        role: EnvRole::Verify,
        source: &[("osq_lower", "1"), ("XOSQ_A", "1"), ("Path", "/p")],
        configured: &["MISSING"],
        agent_env: &[],
        extra: &[],
        result: &[],
    },
];

/// Proves every row of the "Role environments" table.
///
/// Covers: rust-runners/role-environments
#[test]
fn role_environments() {
    for (index, row) in ROWS.iter().enumerate() {
        let source = map(row.source);
        let configured = names(row.configured);
        let agent_env = names(row.agent_env);
        let extra = map(row.extra);
        let found = role_env(row.role, &source, &configured, &agent_env, &extra);
        assert_eq!(found, map(row.result), "role environment row {index}");
    }
}

/// Proves every base name passes and an unlisted name does not.
///
/// Covers: rust-runners/every-base-name-passes
#[test]
fn every_base_name_passes() {
    let base_names = [
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "SHELL",
        "LANG",
        "LANGUAGE",
        "LC_ALL",
        "LC_CTYPE",
        "TERM",
        "TZ",
        "TMPDIR",
        "TMP",
        "TEMP",
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_DATA_HOME",
        "XDG_STATE_HOME",
        "XDG_RUNTIME_DIR",
        "NODE_EXTRA_CA_CERTS",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "CI",
        "NO_COLOR",
        "SYSTEMROOT",
        "COMSPEC",
        "PATHEXT",
        "WINDIR",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "PROGRAMDATA",
    ];
    assert_eq!(BASE_ENV_NAMES, base_names);
    let mut source = BTreeMap::new();
    for name in base_names {
        source.insert(name.to_owned(), "v".to_owned());
    }
    source.insert("UNLISTED".to_owned(), "v".to_owned());
    let found = role_env(EnvRole::Verify, &source, &[], &[], &BTreeMap::new());
    let expected = base_names
        .iter()
        .map(|name| ((*name).to_owned(), "v".to_owned()))
        .collect::<BTreeMap<_, _>>();
    assert_eq!(found, expected);
    assert!(!found.contains_key("UNLISTED"));
}
