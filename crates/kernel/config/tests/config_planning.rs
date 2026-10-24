//! Planning tests: every row of "Planning values" and "Planning errors", the
//! defaults and the partial tables that keep them.

use std::collections::BTreeMap;

use osq_kernel_config::{
    Config, ConfigError, Planning, PlanningDisclosures, PlanningHistory, PlanningPrice,
    PlanningRecord, parse_config,
};

/// The `Planning` value whose every field is its default.
fn defaults() -> Planning {
    Planning {
        disclosures: PlanningDisclosures {
            recent_changes: 3,
            max_characters: 4000,
        },
        history: PlanningHistory {
            minimum_tasks: 30,
            recent_tasks: 100,
            max_characters: 1500,
        },
        record: PlanningRecord {
            minimum_tasks: 5,
            recent_changes: 20,
            dead_outcomes: 10,
        },
        prices: BTreeMap::new(),
    }
}

/// One model's USD prices per million tokens.
fn price(input: f64, output: f64, cache_read: f64, cache_write: f64) -> PlanningPrice {
    PlanningPrice {
        input,
        output,
        cache_read,
        cache_write,
    }
}

/// Proves every default and that an absent `planning` table gives them.
///
/// Covers: rust-config/planning-values
#[test]
fn planning_defaults() {
    let expected = defaults();
    assert_eq!(Planning::default(), expected);
    assert_eq!(PlanningDisclosures::default(), expected.disclosures);
    assert_eq!(PlanningHistory::default(), expected.history);
    assert_eq!(PlanningRecord::default(), expected.record);
    assert_eq!(Config::default().planning, expected);
    assert_eq!(
        parse_config("").expect("empty text is valid").planning,
        expected
    );
}

/// Proves every row of the "Planning prices" table.
///
/// Covers: rust-config/planning-prices
#[test]
fn planning_prices() {
    let rows = [
        ("", Ok(defaults())),
        (
            "[planning.prices.\"claude-opus-5-5\"]\ninput = 5\noutput = 25.5\n\
             cacheRead = 0.5\ncacheWrite = 0",
            Ok(Planning {
                prices: BTreeMap::from([(
                    "claude-opus-5-5".to_owned(),
                    price(5.0, 25.5, 0.5, 0.0),
                )]),
                ..defaults()
            }),
        ),
        (
            "[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = 1\ncacheWrite = 1\n\
             [planning.history]\nminimumTasks = 3",
            Ok(Planning {
                history: PlanningHistory {
                    minimum_tasks: 3,
                    ..defaults().history
                },
                prices: BTreeMap::from([("m".to_owned(), price(1.0, 1.0, 1.0, 1.0))]),
                ..defaults()
            }),
        ),
    ];
    for (text, expected) in rows {
        assert_eq!(
            parse_config(text).map(|config| config.planning),
            expected,
            "for {text:?}"
        );
    }
}

/// Proves every error row of the "Planning prices" table.
///
/// Covers: rust-config/planning-prices
#[test]
fn planning_price_errors() {
    let rows = [
        (
            "[planning]\nprices = 1",
            Err(ConfigError::WrongType {
                key: "planning.prices".to_owned(),
                expected: "a table",
            }),
        ),
        (
            "[planning.prices]\nm = 1",
            Err(ConfigError::WrongType {
                key: "planning.prices.m".to_owned(),
                expected: "a table",
            }),
        ),
        (
            "[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = 1",
            Err(ConfigError::InvalidValue {
                key: "planning.prices.m.cacheWrite".to_owned(),
                reason: "must be a finite non-negative number".to_owned(),
            }),
        ),
        (
            "[planning.prices.m]\ninput = -1\noutput = 1\ncacheRead = 1\ncacheWrite = 1",
            Err(ConfigError::InvalidValue {
                key: "planning.prices.m.input".to_owned(),
                reason: "must be a finite non-negative number".to_owned(),
            }),
        ),
        (
            "[planning.prices.m]\ninput = 1\noutput = \"1\"\ncacheRead = 1\ncacheWrite = 1",
            Err(ConfigError::InvalidValue {
                key: "planning.prices.m.output".to_owned(),
                reason: "must be a finite non-negative number".to_owned(),
            }),
        ),
        (
            "[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = inf\ncacheWrite = 1",
            Err(ConfigError::InvalidValue {
                key: "planning.prices.m.cacheRead".to_owned(),
                reason: "must be a finite non-negative number".to_owned(),
            }),
        ),
        (
            "[planning.prices.m]\ninput = 1\noutput = 1\ncacheRead = 1\ncacheWrite = 1\n\
             reasoning = 1",
            Err(ConfigError::UnknownKey {
                key: "planning.prices.m.reasoning".to_owned(),
            }),
        ),
    ];
    for (text, expected) in rows {
        assert_eq!(
            parse_config(text).map(|config| config.planning),
            expected,
            "for {text:?}"
        );
    }
}

/// Proves every row of the "Planning values" table, whole values compared.
///
/// Covers: rust-config/planning-values
#[test]
fn planning_values() {
    let rows = [
        ("", defaults()),
        ("[planning]", defaults()),
        (
            "[planning.disclosures]\nrecentChanges = 1\nmaxCharacters = 20",
            Planning {
                disclosures: PlanningDisclosures {
                    recent_changes: 1,
                    max_characters: 20,
                },
                ..defaults()
            },
        ),
        (
            "[planning.history]\nminimumTasks = 3\nrecentTasks = 2\nmaxCharacters = 148",
            Planning {
                history: PlanningHistory {
                    minimum_tasks: 3,
                    recent_tasks: 2,
                    max_characters: 148,
                },
                ..defaults()
            },
        ),
        (
            "[planning.record]\nminimumTasks = 6\nrecentChanges = 2\ndeadOutcomes = 1",
            Planning {
                record: PlanningRecord {
                    minimum_tasks: 6,
                    recent_changes: 2,
                    dead_outcomes: 1,
                },
                ..defaults()
            },
        ),
        (
            "[planning.record]\ndeadOutcomes = 1",
            Planning {
                record: PlanningRecord {
                    dead_outcomes: 1,
                    ..defaults().record
                },
                ..defaults()
            },
        ),
    ];
    for (text, expected) in rows {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.planning, expected, "for {text:?}");
    }
}

/// Proves every partial table keeps the defaults of the values it omits.
///
/// Covers: rust-config/planning-values
#[test]
fn partial_tables_keep_defaults() {
    let disclosures = [
        (
            "[planning.disclosures]\nrecentChanges = 9",
            PlanningDisclosures {
                recent_changes: 9,
                ..defaults().disclosures
            },
        ),
        (
            "[planning.disclosures]\nmaxCharacters = 9",
            PlanningDisclosures {
                max_characters: 9,
                ..defaults().disclosures
            },
        ),
    ];
    for (text, expected) in disclosures {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.planning.disclosures, expected, "for {text:?}");
    }
    let histories = [
        (
            "[planning.history]\nminimumTasks = 9",
            PlanningHistory {
                minimum_tasks: 9,
                ..defaults().history
            },
        ),
        (
            "[planning.history]\nrecentTasks = 9",
            PlanningHistory {
                recent_tasks: 9,
                ..defaults().history
            },
        ),
        (
            "[planning.history]\nmaxCharacters = 9",
            PlanningHistory {
                max_characters: 9,
                ..defaults().history
            },
        ),
    ];
    for (text, expected) in histories {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.planning.history, expected, "for {text:?}");
    }
    let records = [
        (
            "[planning.record]\nminimumTasks = 9",
            PlanningRecord {
                minimum_tasks: 9,
                ..defaults().record
            },
        ),
        (
            "[planning.record]\nrecentChanges = 9",
            PlanningRecord {
                recent_changes: 9,
                ..defaults().record
            },
        ),
        (
            "[planning.record]\ndeadOutcomes = 9",
            PlanningRecord {
                dead_outcomes: 9,
                ..defaults().record
            },
        ),
    ];
    for (text, expected) in records {
        let config = parse_config(text).expect("the text is valid");
        assert_eq!(config.planning.record, expected, "for {text:?}");
    }
}

/// Proves every row of the "Planning errors" table.
///
/// Covers: rust-config/planning-errors
#[test]
fn planning_errors() {
    let rows = [
        (
            "[planning.disclosures]\nrecentChanges = 0",
            ConfigError::InvalidValue {
                key: "planning.disclosures.recentChanges".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[planning.disclosures]\nmaxCharacters = -1",
            ConfigError::InvalidValue {
                key: "planning.disclosures.maxCharacters".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[planning.history]\nminimumTasks = 0",
            ConfigError::InvalidValue {
                key: "planning.history.minimumTasks".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[planning.history]\nrecentTasks = \"2\"",
            ConfigError::WrongType {
                key: "planning.history.recentTasks".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[planning.history]\nmaxCharacters = 1.5",
            ConfigError::WrongType {
                key: "planning.history.maxCharacters".to_owned(),
                expected: "an integer",
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

/// Proves the rest of the "Planning errors" table.
///
/// Covers: rust-config/planning-errors
#[test]
fn planning_errors_continue() {
    let rows = [
        (
            "[planning.record]\nminimumTasks = 0",
            ConfigError::InvalidValue {
                key: "planning.record.minimumTasks".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[planning.record]\nrecentChanges = -3",
            ConfigError::InvalidValue {
                key: "planning.record.recentChanges".to_owned(),
                reason: "must be a positive integer".to_owned(),
            },
        ),
        (
            "[planning.record]\ndeadOutcomes = \"10\"",
            ConfigError::WrongType {
                key: "planning.record.deadOutcomes".to_owned(),
                expected: "an integer",
            },
        ),
        (
            "[planning]\nidleGapMinutes = 10",
            ConfigError::UnknownKey {
                key: "planning.idleGapMinutes".to_owned(),
            },
        ),
        (
            "[planning.record]\nmaxDeadOutcomes = 1",
            ConfigError::UnknownKey {
                key: "planning.record.maxDeadOutcomes".to_owned(),
            },
        ),
        (
            "[planning]\nhistory = 1",
            ConfigError::WrongType {
                key: "planning.history".to_owned(),
                expected: "a table",
            },
        ),
        (
            "planning = 1",
            ConfigError::WrongType {
                key: "planning".to_owned(),
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

/// Proves an unknown key is refused in each of the three planning tables.
///
/// Covers: rust-config/planning-errors
#[test]
fn unknown_keys_in_each_table() {
    let rows = [
        (
            "[planning.disclosures]\nprices = 1",
            ConfigError::UnknownKey {
                key: "planning.disclosures.prices".to_owned(),
            },
        ),
        (
            "[planning.history]\nprices = 1",
            ConfigError::UnknownKey {
                key: "planning.history.prices".to_owned(),
            },
        ),
        (
            "[planning.record]\nprices = 1",
            ConfigError::UnknownKey {
                key: "planning.record.prices".to_owned(),
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
