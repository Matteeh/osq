//! Gate tests: every row of "Gate values", the default and the errors.

use osq_kernel_config::{Config, ConfigError, Gates, parse_config};

/// Proves every row of the "Gate values" table.
///
/// Covers: rust-config/gate-values
#[test]
fn gate_values() {
    let readings = [
        ("", 2),
        ("[gates]", 2),
        ("[gates]\ncommitRetries = 0", 0),
        ("[gates]\ncommitRetries = 5", 5),
    ];
    for (text, commit_retries) in readings {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.gates.commit_retries, commit_retries, "for {text:?}");
    }
    let errors = [
        (
            "[gates]\ncommitRetries = -1",
            ConfigError::InvalidValue {
                key: "gates.commitRetries".to_owned(),
                reason: "must be a non-negative integer".to_owned(),
            },
        ),
        (
            "[gates]\ncommitRetries = \"2\"",
            ConfigError::WrongType {
                key: "gates.commitRetries".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[gates]\ncommitRetries = 1.5",
            ConfigError::WrongType {
                key: "gates.commitRetries".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[gates]\nbaselineVerify = \"pnpm verify\"",
            ConfigError::UnknownKey {
                key: "gates.baselineVerify".to_owned(),
            },
        ),
        (
            "gates = 1",
            ConfigError::WrongType {
                key: "gates".to_owned(),
                expected: "a table",
            },
        ),
    ];
    for (text, expected) in errors {
        assert_eq!(
            parse_config(text).expect_err("the text must fail"),
            expected,
            "for {text:?}"
        );
    }
    assert_eq!(Gates::default().commit_retries, 2);
    assert_eq!(
        parse_config("").expect("empty text").gates,
        Gates::default()
    );
    assert_eq!(Config::default().gates, Gates::default());
}
