//! Config file tests: the missing, loaded and unreadable `osq.toml`, a
//! syntax error, an unknown top-level key and every error text.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

use osq_kernel_config::{Config, ConfigError, load_config, parse_config};

/// The number of scratch folders this test binary has made.
static NEXT: AtomicU32 = AtomicU32::new(0);

/// Makes an empty folder under the target's temporary folder.
fn scratch(name: &str) -> PathBuf {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let path =
        Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("{name}-{}-{id}", std::process::id()));
    fs::create_dir_all(&path).expect("the scratch folder is created");
    path
}

/// Proves `load_config` gives `Config::default()` for an empty folder.
///
/// Covers: rust-config/missing-osq-toml
#[test]
fn missing_osq_toml() {
    let root = scratch("missing");
    let config = load_config(&root).expect("a missing osq.toml is the default");
    assert_eq!(config, Config::default());
}

/// Proves `load_config` reads `maxConcurrency` and keeps the other defaults.
///
/// Covers: rust-config/loaded-osq-toml
#[test]
fn loaded_osq_toml() {
    let root = scratch("loaded");
    fs::write(root.join("osq.toml"), "maxConcurrency = 4").expect("the file is written");
    let config = load_config(&root).expect("the file is valid");
    assert_eq!(config.max_concurrency, 4);
    assert_eq!(
        config,
        Config {
            max_concurrency: 4,
            ..Config::default()
        }
    );
}

/// Proves a directory named `osq.toml` is `ConfigError::Read` naming it.
///
/// Covers: rust-config/unreadable-osq-toml
#[test]
fn unreadable_osq_toml() {
    let root = scratch("unreadable");
    fs::create_dir(root.join("osq.toml")).expect("the directory is made");
    let error = load_config(&root).expect_err("a directory is not a file");
    let ConfigError::Read { path, message } = error else {
        panic!("expected ConfigError::Read, got {error}");
    };
    assert_eq!(path, root.join("osq.toml"));
    assert!(!message.is_empty(), "the message names the failure");
}

/// Proves text that is not TOML is `ConfigError::Syntax` with a message.
///
/// Covers: rust-config/not-toml
#[test]
fn not_toml() {
    let error = parse_config("maxConcurrency = 1\n[vcs").expect_err("the text is not TOML");
    let ConfigError::Syntax { message } = error else {
        panic!("expected ConfigError::Syntax, got {error}");
    };
    assert!(!message.is_empty(), "the message names the parse failure");
}

/// Proves the first unknown top-level key in byte order is reported.
///
/// Covers: rust-config/unknown-top-level-key
#[test]
fn unknown_top_level_key() {
    let text = "[server]\nport = 4174\n[limits]\nmaxScopeFiles = 9";
    let error = parse_config(text).expect_err("neither table is an osq.toml key");
    assert_eq!(
        error,
        ConfigError::UnknownKey {
            key: "server".to_owned()
        }
    );
}

/// Proves every error's display text.
///
/// Covers: rust-config/error-texts
#[test]
fn error_texts() {
    let rows = [
        (
            ConfigError::Read {
                path: PathBuf::from("/p/osq.toml"),
                message: "Is a directory (os error 21)".to_owned(),
            },
            "cannot read /p/osq.toml: Is a directory (os error 21)",
        ),
        (
            ConfigError::Syntax {
                message: "unclosed table".to_owned(),
            },
            "osq.toml is not valid TOML: unclosed table",
        ),
        (
            ConfigError::UnknownKey {
                key: "timeouts.gitSecs".to_owned(),
            },
            "timeouts.gitSecs is not an osq.toml key",
        ),
        (
            ConfigError::WrongType {
                key: "vcs.enabled".to_owned(),
                expected: "a boolean",
            },
            "vcs.enabled must be a boolean",
        ),
        (
            ConfigError::InvalidValue {
                key: "maxConcurrency".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
            "maxConcurrency must be a positive integer",
        ),
    ];
    for (error, text) in rows {
        assert_eq!(error.to_string(), text);
    }
}
