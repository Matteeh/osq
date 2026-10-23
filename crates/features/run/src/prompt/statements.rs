//! Pure parsers: a delta spec's requirement statements and the prior output bound.

/// The longest prior failure output kept, in UTF-16 code units.
const PRIOR_CONTEXT_OUTPUT_MAX_LENGTH: usize = 2000;

/// One requirement of a delta or living spec.
pub(crate) struct Requirement {
    /// The trimmed title after `Requirement:`.
    pub(crate) title: String,
    /// The collapsed statement, empty when the requirement has none.
    pub(crate) statement: String,
}

/// Parses every `### Requirement:` block of a spec, in file order.
pub(crate) fn requirements(content: &str) -> Vec<Requirement> {
    let lines: Vec<&str> = content.split('\n').collect();
    let mut found = Vec::new();
    let mut skip = 0;
    for (index, line) in lines.iter().enumerate() {
        if index < skip {
            continue;
        }
        let Some(title) = requirement_title(line) else {
            continue;
        };
        let start = index + 1;
        let end = (start..lines.len())
            .find(|&next| starts_block(lines[next]) || starts_scenario(lines[next]))
            .unwrap_or(lines.len());
        let prose = lines[start..end].join("\n");
        found.push(Requirement {
            title,
            statement: statement(&prose),
        });
        skip = end;
    }
    found
}

/// The title of a `### Requirement:` line, or none for any other line.
fn requirement_title(line: &str) -> Option<String> {
    let rest = line.strip_prefix("###")?;
    let rest = strip_whitespace(rest)?;
    let rest = rest.strip_prefix("Requirement:")?;
    if rest.is_empty() {
        return None;
    }
    Some(trim(rest).to_owned())
}

/// The statement of one requirement's prose, as TypeScript collapses it.
fn statement(prose: &str) -> String {
    let without_comments = without_comments(prose);
    let mut collapsed = String::with_capacity(without_comments.len());
    let mut in_whitespace = false;
    for character in without_comments.chars() {
        if is_js_whitespace(character) {
            if !in_whitespace {
                collapsed.push(' ');
                in_whitespace = true;
            }
        } else {
            collapsed.push(character);
            in_whitespace = false;
        }
    }
    trim(&collapsed).to_owned()
}

/// Removes every terminated HTML comment, keeping an unterminated one as written.
fn without_comments(text: &str) -> String {
    let mut kept = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("<!--") {
        kept.push_str(&rest[..start]);
        let after = &rest[start + 4..];
        let Some(end) = after.find("-->") else {
            kept.push_str(&rest[start..]);
            return kept;
        };
        rest = &after[end + 3..];
    }
    kept.push_str(rest);
    kept
}

/// Cuts the prior failure output at TypeScript's 2000 UTF-16 code units.
pub(crate) fn bounded_output(output: &str) -> String {
    let mut kept = String::with_capacity(output.len());
    let mut units = 0;
    for character in output.chars() {
        let width = character.len_utf16();
        if units + width > PRIOR_CONTEXT_OUTPUT_MAX_LENGTH {
            kept.push('…');
            return kept;
        }
        kept.push(character);
        units += width;
    }
    kept
}

/// Whether a line starts the next `##` or `###` block.
fn starts_block(line: &str) -> bool {
    if let Some(rest) = line.strip_prefix("###") {
        return starts_with_whitespace(rest);
    }
    line.strip_prefix("##")
        .is_some_and(|rest| !rest.starts_with('#') && starts_with_whitespace(rest))
}

/// Whether a line starts a `####` scenario heading.
fn starts_scenario(line: &str) -> bool {
    line.strip_prefix("####")
        .is_some_and(starts_with_whitespace)
}

/// Whether the text starts with at least one JavaScript whitespace character.
fn starts_with_whitespace(text: &str) -> bool {
    text.chars().next().is_some_and(is_js_whitespace)
}

/// Removes leading JavaScript whitespace, or none when there is none.
fn strip_whitespace(text: &str) -> Option<&str> {
    let rest = text.trim_start_matches(is_js_whitespace);
    (rest.len() < text.len()).then_some(rest)
}

/// Removes JavaScript whitespace from both ends.
pub(crate) fn trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

/// Whether a character is whitespace to JavaScript's `\s` and `trim`.
fn is_js_whitespace(character: char) -> bool {
    character != '\u{85}' && (character.is_whitespace() || character == '\u{feff}')
}
