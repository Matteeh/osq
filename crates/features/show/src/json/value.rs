//! A JSON value that keeps object keys in JavaScript's own-property order.

use crate::events::js_number;

/// One JSON value, with object keys in insertion order.
///
/// Implements: rust-show/show-json
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Value {
    /// The JSON `null`.
    Null,
    /// A JSON boolean.
    Bool(bool),
    /// A JSON number, held as JavaScript's 64-bit float.
    Number(f64),
    /// A JSON string.
    String(String),
    /// A JSON array.
    Array(Vec<Value>),
    /// A JSON object whose keys keep their insertion order.
    Object(Vec<(String, Value)>),
}

impl Value {
    /// A string value.
    /// Implements: rust-show/show-json
    pub(crate) fn string(text: impl Into<String>) -> Self {
        Self::String(text.into())
    }

    /// A number value.
    /// Implements: rust-show/show-json
    pub(crate) fn number(value: f64) -> Self {
        Self::Number(value)
    }

    /// An object from its fields, in the order they print.
    /// Implements: rust-show/show-json
    pub(crate) fn object(fields: Vec<(&'static str, Value)>) -> Self {
        Self::Object(
            fields
                .into_iter()
                .map(|(key, value)| (key.to_owned(), value))
                .collect(),
        )
    }

    /// A string-array value.
    /// Implements: rust-show/show-json
    pub(crate) fn strings(items: &[String]) -> Self {
        Self::Array(
            items
                .iter()
                .map(|item| Self::string(item.clone()))
                .collect(),
        )
    }

    /// A named field of an object, with the last value winning.
    /// Implements: rust-show/show-json
    pub(crate) fn field(&self, name: &str) -> Option<&Value> {
        let Self::Object(fields) = self else {
            return None;
        };
        fields
            .iter()
            .rev()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value)
    }
}

/// Renders a value as `JSON.stringify(value, null, 2)` does.
/// Implements: rust-show/show-json
pub(crate) fn render(value: &Value) -> String {
    let mut out = String::new();
    write_value(value, 0, &mut out);
    out
}

/// Writes one value at one indentation depth.
/// Implements: rust-show/show-json
fn write_value(value: &Value, depth: usize, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        Value::Number(number) => write_number(*number, out),
        Value::String(text) => write_string(text, out),
        Value::Array(items) => write_array(items, depth, out),
        Value::Object(fields) => write_object(fields, depth, out),
    }
}

/// Writes a number as JavaScript prints it, or `null` when it is not finite.
/// Implements: rust-show/show-json
fn write_number(number: f64, out: &mut String) {
    if number.is_finite() {
        out.push_str(&js_number(number));
    } else {
        out.push_str("null");
    }
}

/// Writes a string as `JSON.stringify` escapes it.
/// Implements: rust-show/show-json
fn write_string(text: &str, out: &mut String) {
    let escaped = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned());
    out.push_str(&escaped);
}

/// Writes an array, one item per line when it is not empty.
/// Implements: rust-show/show-json
fn write_array(items: &[Value], depth: usize, out: &mut String) {
    if items.is_empty() {
        out.push_str("[]");
        return;
    }
    out.push('[');
    for (index, item) in items.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        newline(depth.saturating_add(1), out);
        write_value(item, depth.saturating_add(1), out);
    }
    newline(depth, out);
    out.push(']');
}

/// Writes an object, its keys in JavaScript's own-property order.
/// Implements: rust-show/show-json
fn write_object(fields: &[(String, Value)], depth: usize, out: &mut String) {
    if fields.is_empty() {
        out.push_str("{}");
        return;
    }
    out.push('{');
    for (index, (key, value)) in ordered(fields).into_iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        newline(depth.saturating_add(1), out);
        write_string(key, out);
        out.push_str(": ");
        write_value(value, depth.saturating_add(1), out);
    }
    newline(depth, out);
    out.push('}');
}

/// The fields with canonical array indexes first, then the rest in file order.
/// Implements: rust-show/show-json
fn ordered(fields: &[(String, Value)]) -> Vec<(&String, &Value)> {
    let mut indexes: Vec<(u32, &String, &Value)> = Vec::new();
    let mut rest: Vec<(&String, &Value)> = Vec::new();
    for (key, value) in fields {
        match array_index(key) {
            Some(index) => indexes.push((index, key, value)),
            None => rest.push((key, value)),
        }
    }
    indexes.sort_by_key(|(index, _, _)| *index);
    let mut ordered: Vec<(&String, &Value)> = indexes
        .into_iter()
        .map(|(_, key, value)| (key, value))
        .collect();
    ordered.extend(rest);
    ordered
}

/// The array index a key canonicalizes to, or `None` for another key.
/// Implements: rust-show/show-json
fn array_index(key: &str) -> Option<u32> {
    let index: u32 = key.parse().ok()?;
    (index.to_string() == key && index < u32::MAX).then_some(index)
}

/// Writes a newline and the indentation of one depth.
/// Implements: rust-show/show-json
fn newline(depth: usize, out: &mut String) {
    out.push('\n');
    for _ in 0..depth {
        out.push_str("  ");
    }
}

/// Parses one JSON text into a value that keeps every object's key order.
/// Implements: rust-show/show-json
pub(crate) fn parse(text: &str) -> Option<Value> {
    let mut parser = Parser { text, index: 0 };
    let value = parser.value()?;
    parser.whitespace();
    (parser.index == text.len()).then_some(value)
}

/// A recursive-descent parser that keeps object keys in file order.
struct Parser<'a> {
    /// The text being parsed.
    text: &'a str,
    /// The byte index of the next character.
    index: usize,
}

impl Parser<'_> {
    /// Parses one value at the current position.
    /// Implements: rust-show/show-json
    fn value(&mut self) -> Option<Value> {
        self.whitespace();
        match self.peek()? {
            '{' => self.object(),
            '[' => self.array(),
            '"' => self.string().map(Value::String),
            't' => self.literal("true", Value::Bool(true)),
            'f' => self.literal("false", Value::Bool(false)),
            'n' => self.literal("null", Value::Null),
            '-' | '0'..='9' => self.number(),
            _ => None,
        }
    }

    /// Parses one object and collapses duplicate keys in JavaScript's way.
    /// Implements: rust-show/show-json
    fn object(&mut self) -> Option<Value> {
        self.index = self.index.saturating_add(1);
        let mut fields: Vec<(String, Value)> = Vec::new();
        self.whitespace();
        if self.take('}') {
            return Some(Value::Object(fields));
        }
        loop {
            self.whitespace();
            let key = self.string()?;
            self.whitespace();
            if !self.take(':') {
                return None;
            }
            let value = self.value()?;
            match fields.iter_mut().find(|(name, _)| *name == key) {
                Some((_, existing)) => *existing = value,
                None => fields.push((key, value)),
            }
            self.whitespace();
            if self.take('}') {
                return Some(Value::Object(fields));
            }
            if !self.take(',') {
                return None;
            }
        }
    }

    /// Parses one array.
    /// Implements: rust-show/show-json
    fn array(&mut self) -> Option<Value> {
        self.index = self.index.saturating_add(1);
        let mut items = Vec::new();
        self.whitespace();
        if self.take(']') {
            return Some(Value::Array(items));
        }
        loop {
            items.push(self.value()?);
            self.whitespace();
            if self.take(']') {
                return Some(Value::Array(items));
            }
            if !self.take(',') {
                return None;
            }
        }
    }

    /// Parses one string token and decodes its escapes.
    /// Implements: rust-show/show-json
    fn string(&mut self) -> Option<String> {
        let start = self.index;
        self.index = self.index.saturating_add(1);
        loop {
            match self.peek()? {
                '"' => {
                    self.index = self.index.saturating_add(1);
                    return serde_json::from_str(self.text.get(start..self.index)?).ok();
                }
                '\\' => self.index = self.index.saturating_add(2),
                character => self.index = self.index.saturating_add(character.len_utf8()),
            }
        }
    }

    /// Parses one number token as a 64-bit float.
    /// Implements: rust-show/show-json
    fn number(&mut self) -> Option<Value> {
        let start = self.index;
        while self
            .peek()
            .is_some_and(|character| matches!(character, '-' | '+' | '.' | 'e' | 'E' | '0'..='9'))
        {
            self.index = self.index.saturating_add(1);
        }
        let number: f64 = self.text.get(start..self.index)?.parse().ok()?;
        Some(Value::Number(number))
    }

    /// Parses one literal, or `None` when the text differs.
    /// Implements: rust-show/show-json
    fn literal(&mut self, text: &str, value: Value) -> Option<Value> {
        if !self.text.get(self.index..)?.starts_with(text) {
            return None;
        }
        self.index = self.index.saturating_add(text.len());
        Some(value)
    }

    /// Consumes one character when it is the expected one.
    /// Implements: rust-show/show-json
    fn take(&mut self, expected: char) -> bool {
        if self.peek() != Some(expected) {
            return false;
        }
        self.index = self.index.saturating_add(expected.len_utf8());
        true
    }

    /// The next character, without consuming it.
    /// Implements: rust-show/show-json
    fn peek(&self) -> Option<char> {
        self.text.get(self.index..)?.chars().next()
    }

    /// Skips JSON whitespace.
    /// Implements: rust-show/show-json
    fn whitespace(&mut self) {
        while self.peek().is_some_and(char::is_whitespace) {
            self.index = self.index.saturating_add(1);
        }
    }
}
