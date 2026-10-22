//! Banned words tests: every row of the read and error scenarios.

use osq_kernel_config::{BannedWord, ConfigError, parse_config};

/// Builds one expected banned word from its trimmed parts.
fn banned(word: &str, paths: &[&str]) -> BannedWord {
    BannedWord {
        word: word.to_owned(),
        paths: paths.iter().map(|path| (*path).to_owned()).collect(),
    }
}

/// The one error every shape fault of `bannedWords` reports.
fn list_error() -> ConfigError {
    ConfigError::InvalidValue {
        key: "bannedWords".to_owned(),
        reason: "must be a list of { word, paths } entries".to_owned(),
    }
}

/// Proves every banned words read row.
///
/// Covers: rust-config/banned-words-read
#[test]
fn banned_words_read() {
    let rows = [
        ("", Vec::new()),
        ("bannedWords = []", Vec::new()),
        (
            "[[bannedWords]]\nword = \" skipped \"\npaths = [\" src/** \", \"crates/**\"]",
            vec![banned("skipped", &["src/**", "crates/**"])],
        ),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = [\"src/**\"]\n\
             [[bannedWords]]\nword = \"todo\"\npaths = [\"crates/**\"]",
            vec![
                banned("skipped", &["src/**"]),
                banned("todo", &["crates/**"]),
            ],
        ),
        (
            "bannedWords = [{ word = \"skipped\", paths = [\"src/**\"] }]",
            vec![banned("skipped", &["src/**"])],
        ),
    ];
    for (text, expected) in rows {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.banned_words, expected, "for {text:?}");
    }
}

/// Proves every banned words error row and the list error's text.
///
/// Covers: rust-config/banned-word-errors
#[test]
fn banned_word_errors() {
    let rows = [
        ("bannedWords = \"skipped\"", list_error()),
        ("bannedWords = [\"skipped\"]", list_error()),
        ("[[bannedWords]]\npaths = [\"src/**\"]", list_error()),
        (
            "[[bannedWords]]\nword = \" \"\npaths = [\"src/**\"]",
            list_error(),
        ),
        (
            "[[bannedWords]]\nword = 3\npaths = [\"src/**\"]",
            list_error(),
        ),
        ("[[bannedWords]]\nword = \"skipped\"", list_error()),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = []",
            list_error(),
        ),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = \"src/**\"",
            list_error(),
        ),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = [\"src/**\", \" \"]",
            list_error(),
        ),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = [1]",
            list_error(),
        ),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = [\"src/**\"]\nnote = \"x\"",
            ConfigError::UnknownKey {
                key: "bannedWords.note".to_owned(),
            },
        ),
        (
            "[[bannedWords]]\nword = \"\"\nnote = \"x\"",
            ConfigError::UnknownKey {
                key: "bannedWords.note".to_owned(),
            },
        ),
        (
            "[[bannedWords]]\nword = \"skipped\"\npaths = [\"src/**\"]\n\
             [[bannedWords]]\nword = \"\"\npaths = [\"src/**\"]",
            list_error(),
        ),
    ];
    for (text, expected) in rows {
        assert_eq!(
            parse_config(text).expect_err("the text must fail"),
            expected,
            "for {text:?}"
        );
    }
    assert_eq!(
        list_error().to_string(),
        "bannedWords must be a list of { word, paths } entries"
    );
}
