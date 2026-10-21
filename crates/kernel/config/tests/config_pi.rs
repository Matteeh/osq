//! Pi settings tests: every row of the `[pi]` table's read scenario.

use osq_kernel_config::{Config, ConfigError, PiConfig, parse_config};

/// Proves every row of the pi settings table, one assertion per row.
///
/// Covers: rust-config/pi-settings-read
#[test]
fn pi_settings_read() {
    let rows = [
        ("", Ok(PiConfig::default())),
        ("[pi]", Ok(PiConfig::default())),
        (
            "[pi]\nbin = \" /opt/pi/bin/pi \"\nprovider = \" deepseek \"\n\
             model = \"deepseek/deepseek-flash\"\nthinking = \"high\"",
            Ok(PiConfig {
                bin: Some("/opt/pi/bin/pi".to_owned()),
                provider: Some("deepseek".to_owned()),
                model: Some("deepseek/deepseek-flash".to_owned()),
                thinking: Some("high".to_owned()),
            }),
        ),
        (
            "[pi]\nprovider = \"deepseek\"",
            Ok(PiConfig {
                provider: Some("deepseek".to_owned()),
                ..PiConfig::default()
            }),
        ),
        (
            "[pi]\nbin = \"  \"",
            Err(ConfigError::InvalidValue {
                key: "pi.bin".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            }),
        ),
        (
            "[pi]\nprovider = \"\"",
            Err(ConfigError::InvalidValue {
                key: "pi.provider".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            }),
        ),
        (
            "[pi]\nmodel = \" \"",
            Err(ConfigError::InvalidValue {
                key: "pi.model".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            }),
        ),
        (
            "[pi]\nthinking = \"\"",
            Err(ConfigError::InvalidValue {
                key: "pi.thinking".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            }),
        ),
        (
            "[pi]\nmodel = 3",
            Err(ConfigError::WrongType {
                key: "pi.model".to_owned(),
                expected: "a string",
            }),
        ),
        (
            "[pi]\nharness = \"pi\"",
            Err(ConfigError::UnknownKey {
                key: "pi.harness".to_owned(),
            }),
        ),
        (
            "pi = \"pi\"",
            Err(ConfigError::WrongType {
                key: "pi".to_owned(),
                expected: "a table",
            }),
        ),
    ];
    for (text, expected) in rows {
        let pi = parse_config(text).map(|config| config.pi);
        assert_eq!(pi, expected, "for {text:?}");
    }
    assert_eq!(Config::default().pi, PiConfig::default());
}
