//! Building pi's argv for one headless task run.

use super::PiSettings;

/// The flags every task run starts with.
const BASE_ARGS: &[&str] = &[
    "--mode",
    "json",
    "--no-session",
    "--no-approve",
    "--offline",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
];

/// Builds the base arguments, the settings that are set, and the prompt.
pub(super) fn build(settings: &PiSettings, prompt: &str) -> Vec<String> {
    let mut args: Vec<String> = BASE_ARGS.iter().map(|flag| (*flag).to_owned()).collect();
    append_setting(&mut args, "--provider", settings.provider.as_deref());
    append_setting(&mut args, "--model", settings.model.as_deref());
    append_setting(&mut args, "--thinking", settings.thinking.as_deref());
    args.push("--".to_owned());
    args.push(prompt.to_owned());
    args
}

/// Adds a flag and its trimmed value when the value is not blank.
fn append_setting(args: &mut Vec<String>, flag: &str, value: Option<&str>) {
    let Some(value) = value else {
        return;
    };
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    args.push(flag.to_owned());
    args.push(value.to_owned());
}
