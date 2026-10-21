//! Version control tests: the defaults, every key set and every error the
//! `[vcs]` table reports.

use osq_kernel_config::{ConfigError, ManualEdits, VcsConfig, parse_config};

/// Proves every default of the `[vcs]` table.
///
/// Covers: rust-config/version-control-defaults
#[test]
fn version_control_defaults() {
    let expected = VcsConfig {
        enabled: false,
        author: None,
        worktree_root: "~/.osq/worktrees".to_owned(),
        default_branch: None,
        prepare: None,
        after_land: None,
        manual_edits: ManualEdits::Keep,
    };
    let texts = ["", "[vcs]", "[vcs]\nenabled = false"];
    for text in texts {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.vcs, expected);
    }
}

/// Proves every `[vcs]` key is read, the strings trimmed and the author kept.
///
/// Covers: rust-config/every-version-control-key-set
#[test]
fn every_version_control_key_set() {
    let text = "[vcs]\nenabled = true\nauthor = \"osq <osq@noreply.invalid>\"\n\
        worktreeRoot = \" /srv/osq/worktrees \"\ndefaultBranch = \"trunk\"\n\
        prepare = \"pnpm install --frozen-lockfile\"\nafterLand = \"pnpm build\"\n\
        manualEdits = \"block\"";
    let config = parse_config(text).expect("the text is valid");
    assert_eq!(
        config.vcs,
        VcsConfig {
            enabled: true,
            author: Some("osq <osq@noreply.invalid>".to_owned()),
            worktree_root: "/srv/osq/worktrees".to_owned(),
            default_branch: Some("trunk".to_owned()),
            prepare: Some("pnpm install --frozen-lockfile".to_owned()),
            after_land: Some("pnpm build".to_owned()),
            manual_edits: ManualEdits::Block,
        }
    );
}

/// Proves every `[vcs]` error row that the table key, enabled flag or
/// missing author reports.
///
/// Covers: rust-config/version-control-errors
#[test]
fn version_control_errors() {
    let rows = [
        (
            "vcs = \"on\"",
            ConfigError::WrongType {
                key: "vcs".to_owned(),
                expected: "a table",
            },
        ),
        (
            "[vcs]\nbranch = \"main\"",
            ConfigError::UnknownKey {
                key: "vcs.branch".to_owned(),
            },
        ),
        (
            "[vcs]\nenabled = \"yes\"",
            ConfigError::WrongType {
                key: "vcs.enabled".to_owned(),
                expected: "a boolean",
            },
        ),
        (
            "[vcs]\nenabled = true",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "is required when vcs.enabled is true".to_owned(),
            },
        ),
        (
            "[vcs]\nauthor = 7",
            ConfigError::WrongType {
                key: "vcs.author".to_owned(),
                expected: "a string",
            },
        ),
        (
            "[vcs]\nauthor = \"osq\"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
            },
        ),
        (
            "[vcs]\nauthor = \"osq <>\"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
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

/// Proves every `[vcs]` error row for a malformed author and a bad value.
///
/// Covers: rust-config/version-control-errors
#[test]
fn version_control_value_errors() {
    let rows = [
        (
            "[vcs]\nauthor = \" osq <a@b>\"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
            },
        ),
        (
            "[vcs]\nauthor = \"osq<a@b>\"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
            },
        ),
        (
            "[vcs]\nauthor = \"osq <a@b> \"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
            },
        ),
        (
            "[vcs]\nauthor = \"a <b<c>\"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
            },
        ),
        (
            "[vcs]\nauthor = \"a <b>c>\"",
            ConfigError::InvalidValue {
                key: "vcs.author".to_owned(),
                reason: "must look like \"Name <email>\"".to_owned(),
            },
        ),
        (
            "[vcs]\nprepare = \"  \"",
            ConfigError::InvalidValue {
                key: "vcs.prepare".to_owned(),
                reason: "must be a non-empty string".to_owned(),
            },
        ),
        (
            "[vcs]\nmanualEdits = \"drop\"",
            ConfigError::InvalidValue {
                key: "vcs.manualEdits".to_owned(),
                reason: "must be \"keep\" or \"block\"".to_owned(),
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

/// Proves a one-character name and email is an author, with vcs still off.
///
/// Covers: rust-config/short-author-accepted
#[test]
fn short_author_accepted() {
    let config = parse_config("[vcs]\nauthor = \"a <b>\"").expect("the author is valid");
    assert_eq!(config.vcs.author, Some("a <b>".to_owned()));
    assert!(!config.vcs.enabled);
}

/// Proves `manualEdits = "keep"` is `ManualEdits::Keep`.
///
/// Covers: rust-config/version-control-defaults
#[test]
fn manual_edits_keep() {
    let config = parse_config("[vcs]\nmanualEdits = \"keep\"").expect("the mode is valid");
    assert_eq!(config.vcs.manual_edits, ManualEdits::Keep);
}
