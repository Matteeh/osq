//! Harness settings tests: every row of "Harness settings read" and the
//! defaults an absent table gives.

use osq_kernel_config::{
    AgyConfig, ClaudeConfig, CodexConfig, Config, ConfigError, OpencodeConfig, parse_config,
};

/// Proves every row of the "Harness settings read" table.
///
/// Covers: rust-config/harness-settings-read
#[test]
fn harness_settings_read() {
    let config = parse_config("").expect("empty text is valid");
    assert_eq!(config.agy, AgyConfig::default());
    assert_eq!(config.opencode, OpencodeConfig::default());
    assert_eq!(config.codex, CodexConfig::default());
    assert_eq!(config.claude, ClaudeConfig::default());
    assert_eq!(config.opencode.agent, "osq-coder");
    assert_eq!(Config::default().agy, AgyConfig::default());
    assert_eq!(Config::default().opencode, OpencodeConfig::default());
    assert_eq!(Config::default().codex, CodexConfig::default());
    assert_eq!(Config::default().claude, ClaudeConfig::default());

    let agy = parse_config("[agy]\ndangerouslySkipPermissions = true").expect("the key is valid");
    assert!(agy.agy.dangerously_skip_permissions);
    assert_eq!(
        agy.agy,
        AgyConfig {
            dangerously_skip_permissions: true,
        }
    );

    let opencode = parse_config("[opencode]\nbin = \" /opt/opencode \"\nagent = \"mine\"")
        .expect("the keys are valid");
    assert_eq!(
        opencode.opencode,
        OpencodeConfig {
            bin: Some("/opt/opencode".to_owned()),
            agent: "mine".to_owned(),
        }
    );

    let opencode = parse_config("[opencode]\nbin = \"oc\"").expect("the key is valid");
    assert_eq!(
        opencode.opencode,
        OpencodeConfig {
            bin: Some("oc".to_owned()),
            ..OpencodeConfig::default()
        }
    );
    assert_eq!(opencode.opencode.agent, "osq-coder");

    let codex = parse_config("[codex]\nbin = \"/opt/codex\"").expect("the key is valid");
    assert_eq!(
        codex.codex,
        CodexConfig {
            bin: Some("/opt/codex".to_owned()),
        }
    );

    let claude = parse_config("[claude]\nbin = \"/opt/claude\"\nsandbox = true")
        .expect("the keys are valid");
    assert_eq!(
        claude.claude,
        ClaudeConfig {
            bin: Some("/opt/claude".to_owned()),
            sandbox: true,
        }
    );
}

/// Proves every error row of the "Harness settings read" table.
///
/// Covers: rust-config/harness-settings-read
#[test]
fn harness_settings_errors() {
    let rows = [
        (
            "[agy]\ndangerouslySkipPermissions = \"yes\"",
            ConfigError::WrongType {
                key: "agy.dangerouslySkipPermissions".to_owned(),
                expected: "a boolean",
            },
        ),
        (
            "[agy]\nmodel = \"m\"",
            ConfigError::UnknownKey {
                key: "agy.model".to_owned(),
            },
        ),
        (
            "[opencode]\nagent = \" \"",
            ConfigError::InvalidValue {
                key: "opencode.agent".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            },
        ),
        (
            "[opencode]\nbin = 1",
            ConfigError::WrongType {
                key: "opencode.bin".to_owned(),
                expected: "a string",
            },
        ),
        (
            "[codex]\neffort = \"high\"",
            ConfigError::UnknownKey {
                key: "codex.effort".to_owned(),
            },
        ),
        (
            "[claude]\nbin = \"\"",
            ConfigError::InvalidValue {
                key: "claude.bin".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            },
        ),
        (
            "[claude]\nsandbox = 1",
            ConfigError::WrongType {
                key: "claude.sandbox".to_owned(),
                expected: "a boolean",
            },
        ),
        (
            "claude = \"claude\"",
            ConfigError::WrongType {
                key: "claude".to_owned(),
                expected: "a table",
            },
        ),
    ];
    for (text, expected) in rows {
        assert_eq!(
            parse_config(text).expect_err("the text must fail"),
            expected,
            "for {text:?}"
        );
    }
}
