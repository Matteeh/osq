//! Timeout and concurrency tests: the defaults, every key set and every
//! error the shared integer rule reports.

use std::time::Duration;

use osq_kernel_config::{ConfigError, Timeouts, parse_config};

/// Proves the default concurrency and every default timeout.
///
/// Covers: rust-config/timeout-defaults
#[test]
fn timeout_defaults() {
    let expected = Timeouts {
        stale_lock: Duration::from_secs(2700),
        task_timeout: Duration::from_secs(1800),
        verify_timeout: Duration::from_secs(600),
        harness_preflight: Duration::from_secs(10),
        harness_kill_grace: Duration::from_millis(5000),
        git: Duration::from_secs(10),
        git_commit: Duration::from_secs(120),
        git_remote: Duration::from_secs(120),
    };
    let texts = [
        "",
        "[timeouts]",
        "maxConcurrency = 1\n[timeouts]\ngitSeconds = 10",
    ];
    for text in texts {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.max_concurrency, 1);
        assert_eq!(config.timeouts, expected);
    }
}

/// Proves every timeout key is read with its own unit.
///
/// Covers: rust-config/every-timeout-set
#[test]
fn every_timeout_set() {
    let text = "maxConcurrency = 3\n[timeouts]\nstaleLockSeconds = 3600\n\
        taskTimeoutSeconds = 2400\nverifyTimeoutSeconds = 900\n\
        harnessPreflightSeconds = 20\nharnessKillGracePeriodMs = 2500\n\
        gitSeconds = 15\ngitCommitSeconds = 180\ngitRemoteSeconds = 240";
    let config = parse_config(text).expect("the text is valid");
    assert_eq!(config.max_concurrency, 3);
    assert_eq!(
        config.timeouts,
        Timeouts {
            stale_lock: Duration::from_secs(3600),
            task_timeout: Duration::from_secs(2400),
            verify_timeout: Duration::from_secs(900),
            harness_preflight: Duration::from_secs(20),
            harness_kill_grace: Duration::from_millis(2500),
            git: Duration::from_secs(15),
            git_commit: Duration::from_secs(180),
            git_remote: Duration::from_secs(240),
        }
    );
}

/// Proves every timeout and concurrency error row.
///
/// Covers: rust-config/timeout-errors
#[test]
fn timeout_errors() {
    let rows = [
        (
            "maxConcurrency = 0",
            ConfigError::InvalidValue {
                key: "maxConcurrency".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "maxConcurrency = \"3\"",
            ConfigError::WrongType {
                key: "maxConcurrency".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "timeouts = 5",
            ConfigError::WrongType {
                key: "timeouts".to_owned(),
                expected: "a table",
            },
        ),
        (
            "[timeouts]\ngitSecs = 5",
            ConfigError::UnknownKey {
                key: "timeouts.gitSecs".to_owned(),
            },
        ),
        (
            "[timeouts]\ngitSeconds = 1.5",
            ConfigError::WrongType {
                key: "timeouts.gitSeconds".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[timeouts]\ngitSeconds = -1",
            ConfigError::InvalidValue {
                key: "timeouts.gitSeconds".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[timeouts]\nstaleLockSeconds = 0\ngitSeconds = 0",
            ConfigError::InvalidValue {
                key: "timeouts.staleLockSeconds".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[timeouts]\nzzz = 1\ngitSeconds = 0",
            ConfigError::UnknownKey {
                key: "timeouts.zzz".to_owned(),
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
