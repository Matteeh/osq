//! Matching one project-relative path against scope entries, as TypeScript
//! osq's `scopeCoversPath` and `globToRegExp` do (ADR 026).

/// One token of a translated scope glob, one per `globToRegExp` piece.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token {
    /// `[^/]*`: any text within one segment.
    WithinSegment,
    /// `.*`: any text across segments.
    AcrossSegments,
    /// `(?:.*/)?`: zero or more whole segments.
    WholeSegments,
    /// `[^/]`: exactly one character that is not `/`.
    OneChar,
    /// A character that matches only itself.
    Literal(char),
}

/// True for JavaScript's `\s`: Unicode whitespace except U+0085, plus U+FEFF.
fn is_js_whitespace(c: char) -> bool {
    (c.is_whitespace() && c != '\u{0085}') || c == '\u{feff}'
}

/// Trims JavaScript whitespace from both ends, as `String.prototype.trim` does.
fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

/// Normalizes an entry or path: trimmed, backslashes to slashes, no leading `./`.
fn normalize(value: &str) -> String {
    js_trim(value)
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_string()
}

/// Translates a normalized entry into the tokens that match it.
fn translate(normalized: &str) -> Vec<Token> {
    let pattern = if normalized.ends_with('/') {
        format!("{normalized}**")
    } else {
        normalized.to_string()
    };
    let mut tokens = Vec::new();
    let mut chars = pattern.chars().peekable();
    while let Some(character) = chars.next() {
        match character {
            '*' if chars.peek() != Some(&'*') => tokens.push(Token::WithinSegment),
            '*' => {
                chars.next();
                if chars.peek() == Some(&'/') {
                    chars.next();
                    tokens.push(Token::WholeSegments);
                } else {
                    tokens.push(Token::AcrossSegments);
                }
            }
            '?' => tokens.push(Token::OneChar),
            other => tokens.push(Token::Literal(other)),
        }
    }
    tokens
}

/// True when `tokens` match the whole of `path`.
fn matches(tokens: &[Token], path: &str) -> bool {
    let Some((token, rest)) = tokens.split_first() else {
        return path.is_empty();
    };
    match token {
        Token::Literal(expected) => path
            .strip_prefix(*expected)
            .is_some_and(|tail| matches(rest, tail)),
        Token::OneChar => path
            .chars()
            .next()
            .filter(|character| *character != '/')
            .is_some_and(|character| matches(rest, &path[character.len_utf8()..])),
        Token::WithinSegment => star_matches(rest, path, false),
        Token::AcrossSegments => star_matches(rest, path, true),
        Token::WholeSegments => whole_segments(rest, path),
    }
}

/// Matches a `*` token, crossing `/` only when `across` is set.
fn star_matches(rest: &[Token], path: &str, across: bool) -> bool {
    if matches(rest, path) {
        return true;
    }
    let mut tail = path;
    for character in path.chars() {
        if !across && character == '/' {
            break;
        }
        tail = &tail[character.len_utf8()..];
        if matches(rest, tail) {
            return true;
        }
    }
    false
}

/// Matches `(?:.*/)?`: zero or more whole segments, or nothing.
fn whole_segments(rest: &[Token], path: &str) -> bool {
    if matches(rest, path) {
        return true;
    }
    let mut tail = path;
    for character in path.chars() {
        tail = &tail[character.len_utf8()..];
        if character == '/' && matches(rest, tail) {
            return true;
        }
    }
    false
}

/// True when a list of scope entries covers one project-relative path.
///
/// Implements: rust-core/scope-coverage
#[must_use]
pub fn scope_covers_path(scope: &[String], path: &str) -> bool {
    let target = normalize(path);
    scope.iter().any(|raw| {
        let entry = normalize(raw);
        entry == target || matches(&translate(&entry), &target)
    })
}
