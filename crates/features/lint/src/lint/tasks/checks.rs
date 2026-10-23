//! The per-task rules: frontmatter, acceptance lines, the tests gate, the verify
//! command, limits and brace groups.

use std::path::Path;

use osq_kernel_loop::scope_files;
use osq_kernel_specs::{js_trim, parse_frontmatter, parse_task_file};
use yaml_rust2::yaml::{Hash, Yaml};

use super::super::finding::{Finding, Severity};
use super::super::verify;
use super::{Input, TaskData, regular_file};

/// The findings one task file gives, and its data when its frontmatter parses.
pub(super) struct Outcome {
    /// The task file's findings, in order.
    pub(super) findings: Vec<Finding>,
    /// The task's data for the cross-task warnings, or none without frontmatter.
    pub(super) task: Option<TaskData>,
}

/// Every per-task finding for one task file.
pub(super) fn findings(input: &Input, name: &str, path: &str, content: &str) -> Outcome {
    let mut findings = Vec::new();
    let frontmatter = parse_frontmatter(content);
    if let Err(syntax) = &frontmatter {
        findings.push(error(
            path,
            format!(
                "Task in {name} frontmatter is not valid YAML at line {}: {}",
                syntax.line, syntax.message
            ),
        ));
    }
    scan_fused_acceptance(name, path, content, &mut findings);
    if frontmatter.is_err() {
        return Outcome {
            findings,
            task: None,
        };
    }
    let Ok(frontmatter) = frontmatter else {
        return Outcome {
            findings,
            task: None,
        };
    };
    let Ok(file) = parse_task_file(content) else {
        return Outcome {
            findings,
            task: None,
        };
    };
    if let Some(value) = tests_modify(&frontmatter.data) {
        if !matches!(value, Yaml::Boolean(_)) {
            findings.push(error(
                path,
                format!(
                    "Task in {name} tests.modify must be a boolean (got {})",
                    json(value)
                ),
            ));
        }
    }
    let existing = existing_paths(input.root, &file.scope);
    add_gated(&mut findings, input, name, path, &file, &existing);
    let analysis = add_verify(&mut findings, input, name, path, &file.verify);
    add_limits(&mut findings, input, name, path, &file);
    add_braces(&mut findings, name, path, &file.scope, &file.entry);
    Outcome {
        findings,
        task: Some(TaskData {
            name: name.to_owned(),
            number: name.strip_suffix(".md").unwrap_or(name).to_owned(),
            path: path.to_owned(),
            scope: file.scope,
            verify: file.verify,
            verify_starts: file.verify_starts,
            existing,
            analysis,
        }),
    }
}

/// One task error with no section.
fn error(path: &str, message: String) -> Finding {
    Finding::new(Severity::Error, path, None, message)
}

/// Adds one error per line carrying two or more acceptance checkboxes.
fn scan_fused_acceptance(name: &str, path: &str, content: &str, findings: &mut Vec<Finding>) {
    for (index, line) in content.split('\n').enumerate() {
        if checkboxes(line) > 1 {
            findings.push(error(
                path,
                format!(
                    "Task in {name} contains fused acceptance lines on line {}",
                    index + 1
                ),
            ));
        }
    }
}

/// Counts the acceptance checkboxes on one line.
fn checkboxes(line: &str) -> usize {
    let mut count = 0;
    for (index, character) in line.char_indices() {
        if character != '-' && character != '*' {
            continue;
        }
        if checkbox_after(&line[index + 1..]) {
            count += 1;
        }
    }
    count
}

/// True when a checkbox follows a list marker.
fn checkbox_after(rest: &str) -> bool {
    let candidate = rest.trim_start_matches(is_space).as_bytes();
    candidate.len() >= 3
        && candidate[0] == b'['
        && matches!(candidate[1], b' ' | b'x' | b'X')
        && candidate[2] == b']'
}

/// The declared `tests.modify` value, nested first, then the flat key.
fn tests_modify(mapping: &Hash) -> Option<&Yaml> {
    if let Some(Yaml::Hash(tests)) = lookup(mapping, "tests") {
        if let Some(value) = lookup(tests, "modify") {
            return Some(value);
        }
    }
    lookup(mapping, "tests.modify")
}

/// Looks up one string key in a YAML mapping.
fn lookup<'a>(mapping: &'a Hash, key: &str) -> Option<&'a Yaml> {
    mapping.get(&Yaml::String(key.to_owned()))
}

/// Writes a YAML value as JSON with no spaces, as `JSON.stringify` writes it.
fn json(value: &Yaml) -> String {
    let converted = json_value(value);
    serde_json::to_string(&converted).unwrap_or_else(|_| "null".to_owned())
}

/// Converts the YAML values frontmatter can hold to their JSON equivalents.
fn json_value(value: &Yaml) -> serde_json::Value {
    match value {
        Yaml::String(text) | Yaml::Real(text) => serde_json::Value::String(text.clone()),
        Yaml::Integer(number) => serde_json::Value::from(*number),
        Yaml::Boolean(flag) => serde_json::Value::Bool(*flag),
        Yaml::Array(items) => serde_json::Value::Array(items.iter().map(json_value).collect()),
        Yaml::Hash(mapping) => serde_json::Value::Object(
            mapping
                .iter()
                .map(|(key, value)| (key_text(key), json_value(value)))
                .collect(),
        ),
        Yaml::Null | Yaml::BadValue | Yaml::Alias(_) => serde_json::Value::Null,
    }
}

/// A YAML mapping key's text, as a JSON object key.
fn key_text(key: &Yaml) -> String {
    match key {
        Yaml::String(text) | Yaml::Real(text) => text.clone(),
        Yaml::Integer(number) => number.to_string(),
        Yaml::Boolean(flag) => flag.to_string(),
        Yaml::Null => "null".to_owned(),
        _ => String::new(),
    }
}

/// The regular files a task's scope resolves to.
fn existing_paths(root: &Path, scope: &[String]) -> Vec<String> {
    scope_files(root, scope)
        .into_iter()
        .filter(|path| regular_file(root, path))
        .collect()
}

/// Adds the frozen-test gate error when existing test files are touched.
fn add_gated(
    findings: &mut Vec<Finding>,
    input: &Input,
    name: &str,
    path: &str,
    file: &osq_kernel_specs::TaskFile,
    existing: &[String],
) {
    if file.tests_modify || existing.is_empty() {
        return;
    }
    let mut touched: Vec<&String> = existing
        .iter()
        .filter(|entry| input.gated.covers(entry))
        .collect();
    if touched.is_empty() {
        return;
    }
    touched.sort();
    let paths: Vec<&str> = touched.iter().map(|entry| entry.as_str()).collect();
    findings.push(error(
        path,
        format!(
            "Task in {name} scope touches existing test files ({}) without tests.modify: true",
            paths.join(", ")
        ),
    ));
}

/// Adds the verify command finding and returns its analysis.
fn add_verify(
    findings: &mut Vec<Finding>,
    input: &Input,
    name: &str,
    path: &str,
    verify: &str,
) -> verify::Analysis {
    let analysis = super::analyze(input.root, verify, input.project);
    let label = format!("Task in {name}");
    if verify.is_empty() {
        findings.push(error(path, format!("{label} verify command is empty")));
        return analysis;
    }
    if analysis.placeholder {
        findings.push(error(path, verify::placeholder_error(&label)));
    } else if verify::chains(verify) {
        findings.push(error(path, chain_error(name, verify, input.root)));
    } else if let Some(script) = &analysis.missing_script {
        findings.push(error(path, verify::missing_script_error(&label, script)));
    }
    analysis
}

/// The error for a task verify that chains commands.
fn chain_error(name: &str, verify: &str, root: &Path) -> String {
    let advice = if root.join("package.json").exists() {
        "move the chain into a package script and name that script, for example pnpm run <script>"
    } else {
        "move the chain into a script file in the repository and name that file, for example \
         scripts/verify.sh"
    };
    format!("Task in {name} verify chains commands (\"{verify}\"); {advice}")
}

/// Adds the acceptance and scope limit errors.
fn add_limits(
    findings: &mut Vec<Finding>,
    input: &Input,
    name: &str,
    path: &str,
    file: &osq_kernel_specs::TaskFile,
) {
    let acceptance = file.acceptance.len() as u64;
    if acceptance > input.config.limits.max_acceptance_lines {
        findings.push(error(
            path,
            format!(
                "Task in {name} acceptance lines ({acceptance}) exceeds limit {}",
                input.config.limits.max_acceptance_lines
            ),
        ));
    }
    let patterns = file.scope.len() as u64;
    if patterns > input.config.limits.max_scope_files {
        findings.push(error(
            path,
            format!(
                "Task in {name} scope specifies {patterns} patterns, exceeding limit {}",
                input.config.limits.max_scope_files
            ),
        ));
    }
}

/// Adds the brace group errors for scope entries, then entry entries.
fn add_braces(
    findings: &mut Vec<Finding>,
    name: &str,
    path: &str,
    scope: &[String],
    entry: &[String],
) {
    for (label, entries) in [("scope entry", scope), ("entry", entry)] {
        for raw in entries {
            let candidate = js_trim(raw);
            if holds_brace_group(candidate) {
                findings.push(error(
                    path,
                    format!(
                        "Task in {name} {label} \"{candidate}\" holds a brace group, which osq \
                         scope globs do not expand; they support only *, **, ? and a trailing /. \
                         Use a folder glob such as dir/** or one entry per file"
                    ),
                ));
            }
        }
    }
}

/// True when a text holds `{...}` with at least one comma and no other brace.
fn holds_brace_group(text: &str) -> bool {
    for (start, _) in text.match_indices('{') {
        let rest = &text[start + 1..];
        let Some(end) = rest.find(['{', '}']) else {
            continue;
        };
        if rest.as_bytes()[end] != b'}' {
            continue;
        }
        if rest[..end].contains(',') {
            return true;
        }
    }
    false
}

/// True for JavaScript whitespace, which includes the byte order mark.
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}
