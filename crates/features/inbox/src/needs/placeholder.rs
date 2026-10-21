//! Recognizing the placeholder verify command that means a change is unplanned.

/// Whether a verify is the placeholder a planner writes before it plans.
pub(crate) fn is_placeholder(verify: &str) -> bool {
    let words = words(verify);
    let [program, flag, script] = words.as_slice() else {
        return false;
    };
    program == "node" && (flag == "-e" || flag == "--eval") && exits_zero(script)
}

/// Splits a command into words, grouping quoted text and dropping the quotes.
fn words(command: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut chars = command.chars();
    while let Some(character) = chars.next() {
        match character {
            '"' | '\'' => {
                for inner in chars.by_ref() {
                    if inner == character {
                        break;
                    }
                    current.push(inner);
                }
            }
            whitespace if whitespace.is_whitespace() => {
                if !current.is_empty() {
                    words.push(std::mem::take(&mut current));
                }
            }
            other => current.push(other),
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

/// Whether a script reads `process.exit(0)` once normalized.
fn exits_zero(script: &str) -> bool {
    let without_space: String = script
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();
    without_space.trim_end_matches(';') == "process.exit(0)"
}
