//! The `plan <name> --brief <file>` command: write a new change from a brief.

use std::io::{self, Read};
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_specs::{js_trim, parse_frontmatter};
use osq_kernel_storage::Location;
use osq_kernel_vcs::{GitVcs, Vcs};
use yaml_rust2::Yaml;

use crate::next::{self, date, files, handoff, number};
use crate::steer::{self, lookup};

/// The refusal TypeScript gives for a finished change.
fn finished_message(folder: &str, state: &str, name: &str) -> FeatureError {
    FeatureError::failed(
        "plan",
        format!(
            "{folder} has {state}, so osq plan {name} has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>."
        ),
    )
}

/// The refusal TypeScript gives for a bare number that names no change.
fn number_message(name: &str) -> FeatureError {
    FeatureError::failed(
        "plan",
        format!(
            "osq plan {name} names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name."
        ),
    )
}

/// The refusal for a brief that cannot be read.
fn brief_error(brief: &str, source: &io::Error) -> FeatureError {
    FeatureError::failed("plan", format!("Cannot read brief {brief}: {source}"))
}

/// Plans a new change from a brief, refusing each name TypeScript refuses first.
///
/// Implements: rust-plan/plan-arguments
/// Implements: rust-plan/plan-from-a-brief
/// Implements: rust-plan/brief-file-text
/// Implements: rust-plan/plan-print
/// Implements: rust-plan/plan-handoff
pub(crate) fn run_new(
    root: &Path,
    name: &str,
    brief: &str,
    now_ms: i64,
    print: bool,
) -> Result<String, FeatureError> {
    let name = js_trim(name);
    let (config, git_root, found) = lookup::candidates(root)?;
    if found.iter().any(|found| {
        found.entry.location == Location::Active && lookup::matches(&found.entry.folder, name)
    }) {
        return steer::run_steer(root, name, print);
    }
    if let Some(found) = found.iter().find(|found| {
        found.entry.location == Location::Archived && lookup::matches(&found.entry.folder, name)
    }) {
        let state = archived_state(root, &config, &found.entry.folder)?;
        return Err(finished_message(&found.entry.folder, state, name));
    }
    if refuses_number(root, name) {
        return Err(number_message(name));
    }
    let raw = read_brief(root, brief)?;
    let slug = slugify(name);
    if slug.is_empty() {
        return Err(FeatureError::failed("plan", "Spec name cannot be empty"));
    }
    let number = number::next(root, &config, git_root.as_deref())
        .map_err(|message| FeatureError::failed("plan", message))?;
    let folder = format!("{number}-{slug}");
    let change = root.join("openspec").join("changes").join(&folder);
    let proposal = proposal(name);
    let brief_text = brief_text(&raw, &date::utc_date(now_ms));
    next::write_folder(&change, &proposal, &brief_text)?;
    let title = osq_kernel_storage::frontmatter_string(&proposal, "title");
    let title = title.as_deref().unwrap_or(name);
    let prompt = next::opening_prompt(root, &number, Some(title), &folder, &[], &brief_text);
    let sections = next::sections(root)?;
    let text = format!("{prompt}\n\n{sections}");
    if print {
        return Ok(format!("{text}\n"));
    }
    next::write(&change.join("plan-prompt.md"), &text)?;
    let command = root
        .join(".claude")
        .join("commands")
        .join("osq-plan.md")
        .is_file();
    Ok(handoff::format(&change, &number, "unplanned", command))
}

/// The state TypeScript reports for an archived change: landed or archived.
fn archived_state(
    root: &Path,
    config: &Config,
    folder: &str,
) -> Result<&'static str, FeatureError> {
    if !config.vcs.enabled {
        return Ok("archived");
    }
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let fallback = config.vcs.default_branch.as_deref().unwrap_or("main");
    let branch = vcs
        .default_branch(fallback)
        .map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    let path = format!("openspec/changes/archive/{folder}");
    let landed = vcs
        .path_exists(&branch, &path)
        .map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    Ok(if landed { "landed" } else { "archived" })
}

/// Whether the name is all digits and names no change at all.
fn refuses_number(root: &Path, name: &str) -> bool {
    !name.is_empty()
        && name.bytes().all(|byte| byte.is_ascii_digit())
        && !osq_kernel_storage::list_changes(root)
            .iter()
            .any(|entry| lookup::matches(&entry.folder, name))
}

/// Reads the brief from standard input or the file at the root.
fn read_brief(root: &Path, brief: &str) -> Result<String, FeatureError> {
    if brief == "-" {
        let mut text = String::new();
        io::stdin()
            .read_to_string(&mut text)
            .map_err(|source| brief_error(brief, &source))?;
        return Ok(text);
    }
    std::fs::read_to_string(root.join(brief)).map_err(|source| brief_error(brief, &source))
}

/// The new proposal: the template with its title line seeded with the name.
fn proposal(name: &str) -> String {
    files::PROPOSAL.replace("title: Change title", &format!("title: {name}"))
}

/// The new brief with its frontmatter ordered as TypeScript writes it.
fn brief_text(body: &str, date: &str) -> String {
    let trimmed = js_trim(body);
    let parsed = parse_frontmatter(trimmed).ok();
    let mut lines = Vec::new();
    let mut has_planner = false;
    let mut has_date = false;
    let clean_body = match parsed {
        Some(frontmatter) => {
            for (key, value) in &frontmatter.data {
                let key = yaml_text(key);
                let value = if key == "planner" {
                    has_planner = true;
                    "null".to_owned()
                } else if key == "date" {
                    has_date = true;
                    date.to_owned()
                } else {
                    yaml_text(value)
                };
                lines.push(format!("{key}: {value}"));
            }
            frontmatter.body
        }
        None => trimmed.to_owned(),
    };
    if !has_planner {
        lines.push("planner: null".to_owned());
    }
    if !has_date {
        lines.push(format!("date: {date}"));
    }
    format!(
        "---\n{}\n---\n\n{}\n",
        lines.join("\n"),
        js_trim(&clean_body)
    )
}

/// A YAML value as TypeScript's `String` writes it.
fn yaml_text(value: &Yaml) -> String {
    match value {
        Yaml::String(text) => text.clone(),
        Yaml::Integer(number) => number.to_string(),
        Yaml::Real(text) => text
            .parse::<f64>()
            .map_or_else(|_| text.clone(), |number| number.to_string()),
        Yaml::Boolean(flag) => flag.to_string(),
        Yaml::Null => "null".to_owned(),
        _ => String::new(),
    }
}

/// The slug TypeScript's `slugify` gives: lowercase ASCII words joined by dashes.
fn slugify(text: &str) -> String {
    let lowered = text.to_lowercase();
    let mut slug = String::new();
    let mut separator = false;
    for character in js_trim(&lowered).chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            separator = false;
            slug.push(character);
        } else {
            separator = true;
        }
    }
    slug
}
