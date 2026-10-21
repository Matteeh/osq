//! Building the environment of one process osq starts for a role.
//!
//! Implements: rust-runners/role-environment

use std::collections::BTreeMap;

/// The environment variable names every role inherits so a child can find its
/// tools, home, locale, terminal, temporary directory, certificates and shell.
pub const BASE_ENV_NAMES: &[&str] = &[
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

/// The role a process osq starts runs as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvRole {
    /// The role that prepares a change before an agent runs.
    Prepare,
    /// The role that runs the agent.
    Agent,
    /// The role that verifies a task or change.
    Verify,
}

/// Builds the environment of one process osq starts for `role`.
///
/// The result holds only the base names, every `OSQ_` variable, the role's
/// configured names and, for the agent role only, the harness's agent names,
/// all taken from `source`; every `extra` variable is then set last and wins.
///
/// Implements: rust-runners/role-environment
#[must_use]
pub fn role_env(
    role: EnvRole,
    source: &BTreeMap<String, String>,
    configured: &[String],
    agent_env: &[String],
    extra: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    for name in BASE_ENV_NAMES {
        copy(source, name, &mut result);
    }
    for (name, value) in source {
        if name.starts_with("OSQ_") {
            result.insert(name.clone(), value.clone());
        }
    }
    for name in configured {
        if role != EnvRole::Agent && agent_env.contains(name) {
            continue;
        }
        copy(source, name, &mut result);
    }
    if role == EnvRole::Agent {
        for name in agent_env {
            copy(source, name, &mut result);
        }
    }
    for (name, value) in extra {
        result.insert(name.clone(), value.clone());
    }
    result
}

/// Copies one source value into the result when the source sets that name.
fn copy(source: &BTreeMap<String, String>, name: &str, target: &mut BTreeMap<String, String>) {
    if let Some(value) = source.get(name) {
        target.insert(name.to_owned(), value.clone());
    }
}
