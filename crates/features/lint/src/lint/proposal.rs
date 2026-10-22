//! TypeScript's proposal rules: the `## Assumptions` and `## Decisions` sections
//! and the `AGENTS.md` project rules block.

use osq_kernel_specs::{AppliesTo, DecisionRecords, js_trim, project_rules_errors};

use super::finding::{Finding, Severity};

/// The section whose blank text the assumptions rule refuses.
const ASSUMPTIONS: &str = "Assumptions";
/// The section that must name the accepted ADRs governing the change.
const DECISIONS: &str = "Decisions";
/// The file that holds the project rules block.
const AGENTS_FILE: &str = "AGENTS.md";
/// The error for an assumptions section holding only comments and whitespace.
const EMPTY_ASSUMPTIONS: &str =
    "proposal.md's ## Assumptions section is empty: write None or one line per assumption";
/// The error for a missing or blank decisions section.
const MISSING_DECISIONS: &str = "proposal.md needs a ## Decisions section: name each accepted \
                                   ADR that governs a capability this change writes, or write None";

/// Every proposal rule finding for one proposal body, in TypeScript's order.
///
/// `written` names the change's capabilities in byte order, `agents` is the
/// text of `AGENTS.md`, and `max_project_rules` is `limits.maxProjectRules`.
pub(crate) fn findings(
    body: &str,
    proposal_file: &str,
    records: &DecisionRecords,
    agents: &str,
    max_project_rules: u64,
    written: &[String],
) -> Vec<Finding> {
    let mut findings = Vec::new();
    if read_section(body, ASSUMPTIONS).is_some_and(|section| is_blank(&section)) {
        findings.push(Finding::new(
            Severity::Error,
            proposal_file,
            Some(ASSUMPTIONS),
            EMPTY_ASSUMPTIONS,
        ));
    }
    if records.adrs.iter().any(|adr| adr.status == "accepted") {
        add_decisions(
            &mut findings,
            body,
            proposal_file,
            records,
            agents,
            max_project_rules,
            written,
        );
    }
    findings
}

/// Adds the project rules errors and the decisions section findings.
fn add_decisions(
    findings: &mut Vec<Finding>,
    body: &str,
    proposal_file: &str,
    records: &DecisionRecords,
    agents: &str,
    max_project_rules: u64,
    written: &[String],
) {
    for message in project_rules_errors(records, agents, max_project_rules) {
        findings.push(Finding::new(Severity::Error, AGENTS_FILE, None, message));
    }
    let Some(section) = read_section(body, DECISIONS) else {
        push_missing_decisions(findings, proposal_file);
        return;
    };
    if is_blank(&section) {
        push_missing_decisions(findings, proposal_file);
        return;
    }
    let mentioned = mentioned_numbers(&section);
    add_unnamed(findings, records, written, &mentioned, proposal_file);
    add_unknown(findings, records, &mentioned, proposal_file);
}

/// Adds the one missing decisions section error.
fn push_missing_decisions(findings: &mut Vec<Finding>, proposal_file: &str) {
    findings.push(Finding::new(
        Severity::Error,
        proposal_file,
        Some(DECISIONS),
        MISSING_DECISIONS,
    ));
}

/// Adds one error per governing capability ADR the section leaves unnamed.
fn add_unnamed(
    findings: &mut Vec<Finding>,
    records: &DecisionRecords,
    written: &[String],
    mentioned: &[String],
    proposal_file: &str,
) {
    for adr in records.adrs.iter().filter(|adr| adr.status == "accepted") {
        let AppliesTo::Capabilities(governs) = &adr.governs else {
            continue;
        };
        let Some(capability) = written.iter().find(|name| governs.contains(name)) else {
            continue;
        };
        if mentioned
            .iter()
            .any(|number| same_number(number, &adr.number))
        {
            continue;
        }
        findings.push(Finding::new(
            Severity::Error,
            proposal_file,
            Some(DECISIONS),
            format!(
                "proposal.md ## Decisions does not name ADR {}, which applies to {capability}",
                adr.number
            ),
        ));
    }
}

/// Adds one warning per named number that is no accepted ADR's number.
fn add_unknown(
    findings: &mut Vec<Finding>,
    records: &DecisionRecords,
    mentioned: &[String],
    proposal_file: &str,
) {
    for number in mentioned {
        let accepted = records
            .adrs
            .iter()
            .find(|adr| same_number(&adr.number, number))
            .is_some_and(|adr| adr.status == "accepted");
        if accepted {
            continue;
        }
        findings.push(Finding::new(
            Severity::Warning,
            proposal_file,
            Some(DECISIONS),
            format!(
                "proposal.md ## Decisions names ADR {number}, which does not exist or is not \
                 accepted"
            ),
        ));
    }
}

/// The distinct `ADR <n>` numbers a section names, in first-seen order.
fn mentioned_numbers(section: &str) -> Vec<String> {
    let mut numbers: Vec<String> = Vec::new();
    for (index, _) in section.match_indices("ADR") {
        if section[..index]
            .chars()
            .next_back()
            .is_some_and(|previous| previous.is_alphanumeric() || previous == '_')
        {
            continue;
        }
        let Some(number) = number_after(section.get(index + 3..).unwrap_or_default()) else {
            continue;
        };
        if !numbers.iter().any(|seen| same_number(seen, &number)) {
            numbers.push(number);
        }
    }
    numbers
}

/// The digits after the whitespace that follows an `ADR` mention.
fn number_after(rest: &str) -> Option<String> {
    let whitespace = rest
        .chars()
        .take_while(|character| is_space(*character))
        .map(char::len_utf8)
        .sum::<usize>();
    if whitespace == 0 {
        return None;
    }
    let digits: String = rest[whitespace..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    if digits.is_empty() {
        None
    } else {
        Some(digits)
    }
}

/// True when two written numbers name the same ADR once leading zeros drop.
fn same_number(left: &str, right: &str) -> bool {
    normalized_number(left) == normalized_number(right)
}

/// A written number without its leading zeros, or `0` when only zeros remain.
fn normalized_number(number: &str) -> &str {
    let trimmed = number.trim_start_matches('0');
    if trimmed.is_empty() { "0" } else { trimmed }
}

/// The section body after the first heading line that names `heading`.
fn read_section(body: &str, heading: &str) -> Option<String> {
    for (index, _) in body.match_indices("##") {
        if index != 0 && !body[..index].ends_with('\n') {
            continue;
        }
        let end = body[index..]
            .find('\n')
            .map_or(body.len(), |line| index + line);
        let line = body[index..end]
            .strip_suffix('\r')
            .unwrap_or(&body[index..end]);
        if !is_heading(line, heading) {
            continue;
        }
        let rest = &body[end..];
        let boundary = section_boundary(rest).unwrap_or(rest.len());
        return Some(rest[..boundary].to_owned());
    }
    None
}

/// True for `##`, whitespace, then exactly `heading`, and optional whitespace.
fn is_heading(line: &str, heading: &str) -> bool {
    let Some(rest) = line.strip_prefix("##") else {
        return false;
    };
    if !rest.chars().next().is_some_and(is_space) {
        return false;
    }
    trim_space(rest) == heading
}

/// The position of the next line break followed by a top-level heading.
fn section_boundary(section: &str) -> Option<usize> {
    for (index, _) in section.match_indices("\n##") {
        let after = index + 3;
        let next = section[after..].chars().next()?;
        if next != '#' && is_space(next) {
            return Some(index);
        }
    }
    None
}

/// True when a section holds only HTML comments and whitespace.
fn is_blank(section: &str) -> bool {
    js_trim(&remove_comments(section)).is_empty()
}

/// Drops every closed `<!-- ... -->` comment, as TypeScript's pattern does.
fn remove_comments(text: &str) -> String {
    let mut cleaned = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("<!--") {
        cleaned.push_str(&rest[..start]);
        let after = rest[start..].strip_prefix("<!--").unwrap_or_default();
        let Some((_, tail)) = after.split_once("-->") else {
            cleaned.push_str(&rest[start..]);
            return cleaned;
        };
        rest = tail;
    }
    cleaned.push_str(rest);
    cleaned
}

/// True for JavaScript whitespace, which includes the byte order mark.
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}

/// Trims JavaScript whitespace from both ends.
fn trim_space(text: &str) -> &str {
    text.trim_matches(is_space)
}
