//! Role tests: the defaults, the model each harness implies, every role key
//! set, the tables that rely on defaults and every error a role reports.

use std::time::Duration;

use osq_kernel_config::{
    ConfigError, ExecutorConfig, Harness, PlannerConfig, ValidatorConfig, parse_config,
};

/// Proves the executor and planner defaults and that no validator runs.
///
/// Covers: rust-config/role-defaults
#[test]
fn role_defaults() {
    let config = parse_config("").expect("the empty text is valid");
    assert_eq!(
        config.executor,
        ExecutorConfig {
            harness: Harness::Agy,
            model: Some("gemini-3.8-flash-high".to_owned()),
        }
    );
    assert_eq!(
        config.planner,
        PlannerConfig {
            harness: Harness::Agy,
            model: Some("gemini-3.8-flash-high".to_owned()),
            agent: None,
        }
    );
    assert_eq!(config.validator, None);
}

/// Proves each harness's default model and planner agent, and its name.
///
/// Covers: rust-config/executor-model-by-harness
#[test]
fn executor_model_by_harness() {
    let rows = [
        ("agy", Harness::Agy, Some("gemini-3.8-flash-high"), None),
        (
            "opencode",
            Harness::Opencode,
            Some("deepseek/deepseek-flash"),
            Some("osq-planner"),
        ),
        ("mock", Harness::Mock, None, None),
        ("codex", Harness::Codex, None, None),
        ("pi", Harness::Pi, None, None),
        ("claude", Harness::Claude, None, None),
    ];
    for (name, harness, model, agent) in rows {
        let text = format!("[executor]\nharness = \"{name}\"");
        let config = parse_config(&text).expect("the harness is known");
        assert_eq!(config.executor.harness, harness, "for {name}");
        assert_eq!(config.executor.harness.as_str(), name);
        assert_eq!(
            config.executor.model,
            model.map(str::to_owned),
            "for {name}"
        );
        assert_eq!(config.planner.harness, harness, "for {name}");
        assert_eq!(config.planner.model, model.map(str::to_owned), "for {name}");
        assert_eq!(config.planner.agent, agent.map(str::to_owned), "for {name}");
    }
}

/// Proves every role key is read, models trimmed and the agent kept.
///
/// Covers: rust-config/every-role-key-set
#[test]
fn every_role_key_set() {
    let text = "[executor]\nharness = \"pi\"\nmodel = \" deepseek/deepseek-flash \"\n\
        [planner]\nharness = \"opencode\"\nmodel = \"opencode-go/deepseek-v4.1-flash\"\n\
        agent = \"osq-architect\"\n\
        [validator]\nenabled = true\nharness = \"claude\"\nmodel = \"claude-opus-5-5\"\n\
        timeoutSeconds = 1200";
    let config = parse_config(text).expect("the text is valid");
    assert_eq!(
        config.executor,
        ExecutorConfig {
            harness: Harness::Pi,
            model: Some("deepseek/deepseek-flash".to_owned()),
        }
    );
    assert_eq!(
        config.planner,
        PlannerConfig {
            harness: Harness::Opencode,
            model: Some("opencode-go/deepseek-v4.1-flash".to_owned()),
            agent: Some("osq-architect".to_owned()),
        }
    );
    assert_eq!(
        config.validator,
        Some(ValidatorConfig {
            enabled: true,
            harness: Some(Harness::Claude),
            model: Some("claude-opus-5-5".to_owned()),
            timeout: Duration::from_secs(1200),
        })
    );
}

/// Proves each role table that leaves keys out takes the row's value.
///
/// Covers: rust-config/role-tables-with-defaults
#[test]
fn role_tables_with_defaults() {
    let config = parse_config("[executor]\nmodel = \"m\"").expect("the model is valid");
    assert_eq!(
        config.executor,
        ExecutorConfig {
            harness: Harness::Agy,
            model: Some("m".to_owned()),
        }
    );

    let config =
        parse_config("[planner]\nharness = \"opencode\"\nmodel = \"m\"").expect("the keys are set");
    assert_eq!(
        config.planner,
        PlannerConfig {
            harness: Harness::Opencode,
            model: Some("m".to_owned()),
            agent: Some("osq-planner".to_owned()),
        }
    );

    let config = parse_config("[planner]\nharness = \"agy\"\nmodel = \"m\"\nagent = \"a\"")
        .expect("the keys are set");
    assert_eq!(
        config.planner,
        PlannerConfig {
            harness: Harness::Agy,
            model: Some("m".to_owned()),
            agent: Some("a".to_owned()),
        }
    );

    let config =
        parse_config("[validator]\nharness = \"claude\"\nmodel = \"m\"").expect("the keys are set");
    assert_eq!(
        config.validator,
        Some(ValidatorConfig {
            enabled: true,
            harness: Some(Harness::Claude),
            model: Some("m".to_owned()),
            timeout: Duration::from_secs(900),
        })
    );

    let config = parse_config("[validator]\nenabled = false").expect("the flag is valid");
    assert_eq!(
        config.validator,
        Some(ValidatorConfig {
            enabled: false,
            harness: None,
            model: None,
            timeout: Duration::from_secs(900),
        })
    );
}

/// Proves the planner follows an executor model when no planner table exists.
///
/// Covers: rust-config/role-tables-with-defaults
#[test]
fn planner_follows_executor_model() {
    let config = parse_config("[executor]\nmodel = \"m\"").expect("the model is valid");
    assert_eq!(
        config.planner,
        PlannerConfig {
            harness: Harness::Agy,
            model: Some("m".to_owned()),
            agent: None,
        }
    );
}

/// Proves `mock` accepts a planner agent, since its catalog entry has one.
///
/// Covers: rust-config/executor-model-by-harness
#[test]
fn mock_planner_accepts_agent() {
    let text = "[planner]\nharness = \"mock\"\nmodel = \"m\"\nagent = \"a\"";
    let config = parse_config(text).expect("mock accepts an agent");
    assert_eq!(config.planner.agent, Some("a".to_owned()));
}

/// Proves every error the `[executor]` table reports.
///
/// Covers: rust-config/role-errors
#[test]
fn executor_errors() {
    let rows = [
        (
            "executor = \"pi\"",
            ConfigError::WrongType {
                key: "executor".to_owned(),
                expected: "a table",
            },
        ),
        (
            "[executor]\nharnes = \"pi\"",
            ConfigError::UnknownKey {
                key: "executor.harnes".to_owned(),
            },
        ),
        (
            "[executor]\nharness = \"gpt\"",
            ConfigError::InvalidValue {
                key: "executor.harness".to_owned(),
                reason: "must be one of: agy, opencode, mock, codex, pi, claude".to_owned(),
            },
        ),
        (
            "[executor]\nharness = 1",
            ConfigError::WrongType {
                key: "executor.harness".to_owned(),
                expected: "a string",
            },
        ),
        (
            "[executor]\nmodel = \"\"",
            ConfigError::InvalidValue {
                key: "executor.model".to_owned(),
                reason: "must be a non-empty string".to_owned(),
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

/// Proves every error the `[planner]` table reports.
///
/// Covers: rust-config/role-errors
#[test]
fn planner_errors() {
    let rows = [
        (
            "[planner]\nmodel = \"m\"",
            ConfigError::InvalidValue {
                key: "planner.harness".to_owned(),
                reason: "is required".to_owned(),
            },
        ),
        (
            "[planner]\nharness = \"pi\"",
            ConfigError::InvalidValue {
                key: "planner.model".to_owned(),
                reason: "is required".to_owned(),
            },
        ),
        (
            "[planner]\nharness = \"pi\"\nmodel = \"m\"\nagent = \"a\"",
            ConfigError::InvalidValue {
                key: "planner.agent".to_owned(),
                reason: "is not supported by the pi harness".to_owned(),
            },
        ),
        (
            "[planner]\nharness = \"codex\"\nmodel = \"m\"\nagent = \"a\"",
            ConfigError::InvalidValue {
                key: "planner.agent".to_owned(),
                reason: "is not supported by the codex harness".to_owned(),
            },
        ),
        (
            "[planner]\nharness = \"claude\"\nmodel = \"m\"\nagent = \"a\"",
            ConfigError::InvalidValue {
                key: "planner.agent".to_owned(),
                reason: "is not supported by the claude harness".to_owned(),
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

/// Proves every error the `[validator]` table reports.
///
/// Covers: rust-config/role-errors
#[test]
fn validator_errors() {
    let rows = [
        (
            "[validator]\nretries = 1",
            ConfigError::UnknownKey {
                key: "validator.retries".to_owned(),
            },
        ),
        (
            "[validator]\nenabled = 1",
            ConfigError::WrongType {
                key: "validator.enabled".to_owned(),
                expected: "a boolean",
            },
        ),
        (
            "[validator]\nmodel = \"m\"",
            ConfigError::InvalidValue {
                key: "validator.harness".to_owned(),
                reason: "is required when validator.enabled is true".to_owned(),
            },
        ),
        (
            "[validator]\nharness = \"claude\"",
            ConfigError::InvalidValue {
                key: "validator.model".to_owned(),
                reason: "is required when validator.enabled is true".to_owned(),
            },
        ),
        (
            "[validator]\nenabled = false\ntimeoutSeconds = 0",
            ConfigError::InvalidValue {
                key: "validator.timeoutSeconds".to_owned(),
                reason: "must be a positive integer".to_owned(),
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
