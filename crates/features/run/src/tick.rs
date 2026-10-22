//! Ticking one task's checkbox in `tasks.md` text.

/// Whether a character is whitespace for JavaScript's `\s`.
fn is_space(character: char) -> bool {
    character.is_whitespace() || character == '\u{feff}'
}

/// Whether a character is a JavaScript line terminator.
fn is_line_terminator(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The leading decimal digits of `text`, empty when it starts with another character.
fn leading_digits(text: &str) -> &str {
    let end = text.bytes().take_while(u8::is_ascii_digit).count();
    &text[..end]
}

/// The digits without leading zeros, `0` for a run of zeros.
fn canonical_digits(digits: &str) -> &str {
    let trimmed = digits.trim_start_matches('0');
    if trimmed.is_empty() { "0" } else { trimmed }
}

/// A number as JavaScript's `parseInt(text, 10)` reads it.
fn parse_integer(text: &str) -> Option<String> {
    let mut characters = text.chars().peekable();
    while characters
        .peek()
        .is_some_and(|character| is_space(*character))
    {
        characters.next();
    }
    let sign = match characters.peek() {
        Some('-' | '+') => characters.next(),
        _ => None,
    };
    let digits: String = characters.take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return None;
    }
    let canonical = canonical_digits(&digits);
    if sign == Some('-') && canonical != "0" {
        Some(format!("-{canonical}"))
    } else {
        Some(canonical.to_owned())
    }
}

/// The heading text of a `## ` line, with its surrounding whitespace removed.
fn heading_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("##")?;
    if !rest.chars().next().is_some_and(is_space) {
        return None;
    }
    let text = rest.trim_start_matches(is_space).trim_end_matches(is_space);
    if text.is_empty() || text.chars().any(is_line_terminator) {
        return None;
    }
    Some(text)
}

/// The task number a heading starts with, when it starts with one.
fn heading_number(text: &str) -> Option<String> {
    let digits = leading_digits(text);
    if digits.is_empty() {
        return None;
    }
    let rest = &text[digits.len()..];
    let rest = rest
        .strip_prefix('.')
        .or_else(|| rest.strip_prefix(')'))
        .unwrap_or(rest);
    let separated = rest.is_empty() || rest.chars().next().is_some_and(is_space);
    separated.then(|| canonical_digits(digits).to_owned())
}

/// The number an item's own `<n>.` or `<n>)` prefix names, when it has one.
fn item_number(text: &str) -> Option<String> {
    let digits = leading_digits(text);
    if digits.is_empty() {
        return None;
    }
    let rest = &text[digits.len()..];
    let rest = rest.strip_prefix('.').or_else(|| rest.strip_prefix(')'))?;
    rest.chars()
        .next()
        .is_some_and(is_space)
        .then(|| canonical_digits(digits).to_owned())
}

/// The parts of a `- [ ]` item the ticker needs.
struct Item {
    /// The byte index of the mark between the brackets.
    mark: usize,
    /// The mark itself, a space, `x` or `X`.
    letter: char,
    /// The number the item starts with, when it has one.
    number: Option<String>,
}

/// The prefix of a task list item, when the line is one.
fn item_prefix(line: &str) -> Option<Item> {
    let trimmed = line.trim_start_matches(is_space);
    let start = line.len() - trimmed.len();
    let rest = trimmed.strip_prefix('-')?;
    let trimmed = rest.trim_start_matches(is_space);
    let spacing = rest.len() - trimmed.len();
    if spacing == 0 {
        return None;
    }
    let rest = trimmed.strip_prefix('[')?;
    let letter = rest.chars().next()?;
    if !matches!(letter, ' ' | 'x' | 'X') {
        return None;
    }
    let mark = start + spacing + 2;
    let rest = rest.strip_prefix(letter)?.strip_prefix(']')?;
    let rest = rest.trim_start_matches(is_space);
    Some(Item {
        mark,
        letter,
        number: item_number(rest),
    })
}

/// Ticks the row's checkbox when the line is an unticked item of task `target`.
fn tick_line(line: &str, target: &str, section: &mut Option<String>, changed: &mut bool) -> String {
    if let Some(heading) = heading_text(line) {
        *section = heading_number(heading);
        return line.to_owned();
    }
    let Some(item) = item_prefix(line) else {
        return line.to_owned();
    };
    let number = item.number.as_ref().or(section.as_ref());
    if number.map(String::as_str) != Some(target) || item.letter != ' ' {
        return line.to_owned();
    }
    *changed = true;
    let mut ticked = line.to_owned();
    ticked.replace_range(item.mark..=item.mark, "x");
    ticked
}

/// Ticks `task`'s checkbox in `tasks.md` text, leaving the rest of the text alone.
///
/// Implements: rust-run/task-checkbox-tick
#[must_use]
pub fn tick_task_checkbox(content: &str, task: &str) -> String {
    let Some(target) = parse_integer(task) else {
        return content.to_owned();
    };
    let mut section = None;
    let mut changed = false;
    let lines: Vec<String> = content
        .split('\n')
        .map(|line| tick_line(line, &target, &mut section, &mut changed))
        .collect();
    if changed {
        lines.join("\n")
    } else {
        content.to_owned()
    }
}
