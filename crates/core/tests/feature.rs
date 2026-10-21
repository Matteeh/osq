//! Proves the `Feature` trait, its constructors and the text of its errors.

use std::path::PathBuf;

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The `echo` feature: says its arguments, fails on `fail`, refuses the rest.
struct Echo;

impl Feature for Echo {
    fn name(&self) -> &'static str {
        "echo"
    }

    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new("say", "Says words", "<words>..."),
            Command::new("fail", "Always fails", ""),
        ]
    }

    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        match invocation.command.as_str() {
            "say" if invocation.args.is_empty() => Err(FeatureError::usage("say", "needs words")),
            "say" => Ok(Output::text(invocation.args.join(" "))),
            "fail" => Err(FeatureError::failed("fail", "it always fails")),
            other => Err(FeatureError::unknown_command(other)),
        }
    }
}

/// The `count` feature: prints how many arguments it was given.
struct Count;

impl Feature for Count {
    fn name(&self) -> &'static str {
        "count"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new("count", "Counts arguments", "[args]...")]
    }

    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command == "count" {
            Ok(Output::text(invocation.args.len().to_string()))
        } else {
            Err(FeatureError::unknown_command(invocation.command.as_str()))
        }
    }
}

/// Builds an invocation of one command with literal arguments.
fn invocation(command: &str, args: &[&str]) -> Invocation {
    Invocation::new(
        "/p",
        command,
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    )
}

/// Proves every row of "A hand-written feature runs its commands".
///
/// Covers: rust-core/a-hand-written-feature-runs-its-commands
#[test]
fn a_hand_written_feature_runs_its_commands() {
    let cases: [(&str, &[&str], Result<&str, &str>); 4] = [
        ("say", &["a", "b"], Ok("a b")),
        ("say", &[], Err("usage of say: needs words")),
        ("fail", &[], Err("fail failed: it always fails")),
        ("nope", &[], Err("unknown command: nope")),
    ];
    for (command, args, expected) in cases {
        let result = Echo.run(&invocation(command, args));
        match expected {
            Ok(text) => assert_eq!(result.expect("say succeeds").text, text, "{command}"),
            Err(text) => assert_eq!(
                result.expect_err("the command fails").to_string(),
                text,
                "{command}"
            ),
        }
    }
}

/// Proves every THEN line of "Features register as a list".
///
/// Covers: rust-core/features-register-as-a-list
#[test]
fn features_register_as_a_list() {
    let features: Vec<Box<dyn Feature>> = vec![Box::new(Echo), Box::new(Count)];

    let names: Vec<&str> = features.iter().map(|feature| feature.name()).collect();
    assert_eq!(names, ["echo", "count"]);

    let commands: Vec<String> = features
        .iter()
        .flat_map(|feature| feature.commands())
        .map(|command| command.name)
        .collect();
    assert_eq!(commands, ["say", "fail", "count"]);

    let invocation = invocation("count", &["x", "y"]);
    let feature = features
        .iter()
        .find(|feature| {
            feature
                .commands()
                .iter()
                .any(|command| command.name == invocation.command)
        })
        .expect("a feature lists count");
    let output = feature.run(&invocation).expect("count succeeds");
    assert_eq!(output.text, "2");
}

/// Proves every row of "Constructors fill every field".
///
/// Covers: rust-core/constructors-fill-every-field
#[test]
fn constructors_fill_every_field() {
    let command = Command::new("say", "Says words", "<words>...");
    assert_eq!(command.name, "say");
    assert_eq!(command.summary, "Says words");
    assert_eq!(command.usage, "<words>...");

    let invocation = Invocation::new("/p", "say", vec!["a".to_owned(), "b".to_owned()]);
    assert_eq!(invocation.root, PathBuf::from("/p"));
    assert_eq!(invocation.command, "say");
    assert_eq!(invocation.args, ["a", "b"]);

    let output = Output::text("a b");
    assert_eq!(output.text, "a b");

    let unknown = FeatureError::unknown_command("nope");
    assert!(matches!(unknown, FeatureError::UnknownCommand { .. }));
    assert_eq!(unknown.to_string(), "unknown command: nope");

    match FeatureError::usage("say", "needs words") {
        FeatureError::Usage {
            command, message, ..
        } => {
            assert_eq!(command, "say");
            assert_eq!(message, "needs words");
        }
        other => panic!("expected Usage, got {other:?}"),
    }

    match FeatureError::failed("fail", "it always fails") {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "fail");
            assert_eq!(message, "it always fails");
        }
        other => panic!("expected Failed, got {other:?}"),
    }
}

/// Proves every row of "Feature error text".
///
/// Covers: rust-core/feature-error-text
#[test]
fn feature_error_text() {
    let cases: [(FeatureError, &str); 3] = [
        (
            FeatureError::unknown_command("nope"),
            "unknown command: nope",
        ),
        (
            FeatureError::usage("say", "needs words"),
            "usage of say: needs words",
        ),
        (
            FeatureError::failed("fail", "it always fails"),
            "fail failed: it always fails",
        ),
    ];
    for (error, text) in cases {
        assert_eq!(error.to_string(), text, "{error:?}");
    }
}
