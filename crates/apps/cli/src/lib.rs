//! The osq command line: the feature registry, help and command dispatch.
//!
//! The app holds no workflow logic. It lists the feature crates, builds help
//! from their [`Command`](osq_core::Command) data and hands one command line to
//! the first feature that lists the command (ADR 022, ADR 028).

use std::path::Path;

use osq_core::{Command, Feature, Invocation};
use osq_feature_approve::ApproveFeature;
use osq_feature_archive::ArchiveFeature;
use osq_feature_doctor::DoctorFeature;
use osq_feature_inbox::InboxFeature;
use osq_feature_land::LandFeature;
use osq_feature_lint::LintFeature;
use osq_feature_manual::ManualFeature;
use osq_feature_plan::PlanFeature;
use osq_feature_report::ReportFeature;
use osq_feature_retry::RetryFeature;
use osq_feature_run::RunFeature;
use osq_feature_show::ShowFeature;

/// The first line of the top-level help.
const TOP_USAGE: &str = "Usage: osq-rs <command> [args]";

/// The result of running one command line.
///
/// Implements: rust-cli/command-line-result
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliResult {
    /// The text to write to stdout.
    pub stdout: String,
    /// The text to write to stderr.
    pub stderr: String,
    /// The process exit code.
    pub code: i32,
}

/// Every feature crate that implements `Feature`, in registry order.
///
/// Implements: rust-cli/feature-registry
#[must_use]
pub fn features() -> Vec<Box<dyn Feature>> {
    vec![
        Box::new(PlanFeature::new()),
        Box::new(ApproveFeature),
        Box::new(RunFeature),
        Box::new(ArchiveFeature),
        Box::new(LandFeature),
        Box::new(InboxFeature::new()),
        Box::new(ReportFeature),
        Box::new(ShowFeature),
        Box::new(LintFeature),
        Box::new(DoctorFeature),
        Box::new(RetryFeature),
        Box::new(ManualFeature::new()),
    ]
}

/// Runs one command line, `args` without the program name.
///
/// No arguments, or a help flag first, give the top-level help; a help flag
/// second gives the named command's help. Anything else is dispatched to the
/// first feature that lists the command.
///
/// Implements: rust-cli/command-line-result
/// Implements: rust-cli/cli-help
/// Implements: rust-cli/command-dispatch
#[must_use]
pub fn run_cli(features: &[Box<dyn Feature>], root: &Path, args: &[String]) -> CliResult {
    let Some(first) = args.first() else {
        return help(&top_help(features));
    };
    if is_help(first) {
        return help(&top_help(features));
    }
    if args.get(1).is_some_and(|argument| is_help(argument))
        && let Some(command) = find_command(features, first)
    {
        return help(&command_help(&command));
    }
    dispatch(features, root, first, &args[1..])
}

/// A successful result with help text on stdout.
fn help(text: &str) -> CliResult {
    CliResult {
        stdout: text.to_owned(),
        stderr: String::new(),
        code: 0,
    }
}

/// Runs one command through the loop's entry point and prints its reports.
fn dispatch(features: &[Box<dyn Feature>], root: &Path, name: &str, args: &[String]) -> CliResult {
    let invocation = Invocation::new(root, name, args.to_vec());
    let run = osq_kernel_loop::run_command(features, &invocation);
    let (stdout, mut stderr, mut code) = match run.result {
        Ok(output) => (output.text, String::new(), output.code),
        Err(error) => (String::new(), format!("{error}\n"), 1),
    };
    for warning in &run.warnings {
        stderr.push_str(warning);
        stderr.push('\n');
    }
    for failure in &run.failures {
        stderr.push_str(&failure.to_string());
        stderr.push('\n');
        code = 1;
    }
    CliResult {
        stdout,
        stderr,
        code,
    }
}

/// Finds the command a name belongs to, in registry and command order.
fn find_command(features: &[Box<dyn Feature>], name: &str) -> Option<Command> {
    features
        .iter()
        .flat_map(|feature| feature.commands())
        .find(|command| command.name == name)
}

/// The top-level help, built from every registered command.
fn top_help(features: &[Box<dyn Feature>]) -> String {
    let mut text = format!("{TOP_USAGE}\n\nCommands:\n");
    for feature in features {
        for command in feature.commands() {
            text.push_str(&command_line(&command));
        }
    }
    text
}

/// One line of the top-level help.
fn command_line(command: &Command) -> String {
    format!(
        "  {}{}  {}\n",
        command.name,
        usage_suffix(&command.usage),
        command.summary
    )
}

/// The help for one command.
fn command_help(command: &Command) -> String {
    format!(
        "Usage: osq-rs {}{}\n\n{}\n",
        command.name,
        usage_suffix(&command.usage),
        command.summary
    )
}

/// A usage suffix with its leading space, or nothing for an empty usage.
fn usage_suffix(usage: &str) -> String {
    if usage.is_empty() {
        String::new()
    } else {
        format!(" {usage}")
    }
}

/// Whether an argument asks for help.
fn is_help(argument: &str) -> bool {
    argument == "--help" || argument == "-h"
}
