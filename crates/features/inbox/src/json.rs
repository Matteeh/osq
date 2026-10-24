//! An ordered JSON tree rendered as TypeScript's `JSON.stringify(value, null, 2)`.

mod inbox;

pub(crate) use inbox::inbox;

/// One JSON value whose object members keep their insertion order.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Json {
    /// `null`.
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// A number, already written as JSON.
    Number(String),
    /// A string, escaped as `JSON.stringify` escapes it.
    String(String),
    /// An array.
    Array(Vec<Self>),
    /// An object of members in order.
    Object(Vec<(&'static str, Self)>),
}

impl Json {
    /// Renders the value with two-space indentation and no trailing newline.
    pub(crate) fn render(&self) -> String {
        let mut out = String::new();
        self.write(&mut out, 0);
        out
    }

    /// Writes the value at `depth` into `out`.
    fn write(&self, out: &mut String, depth: usize) {
        match self {
            Self::Null => out.push_str("null"),
            Self::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            Self::Number(value) => out.push_str(value),
            Self::String(value) => out.push_str(&quote(value)),
            Self::Array(values) if values.is_empty() => out.push_str("[]"),
            Self::Array(values) => {
                out.push_str("[\n");
                for (index, value) in values.iter().enumerate() {
                    if index > 0 {
                        out.push_str(",\n");
                    }
                    indent(out, depth + 1);
                    value.write(out, depth + 1);
                }
                out.push('\n');
                indent(out, depth);
                out.push(']');
            }
            Self::Object(members) => {
                out.push_str("{\n");
                for (index, (key, value)) in members.iter().enumerate() {
                    if index > 0 {
                        out.push_str(",\n");
                    }
                    indent(out, depth + 1);
                    out.push_str(&quote(key));
                    out.push_str(": ");
                    value.write(out, depth + 1);
                }
                out.push('\n');
                indent(out, depth);
                out.push('}');
            }
        }
    }
}

/// Appends `depth` levels of two-space indentation.
fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}

/// Writes a string as `JSON.stringify` escapes it.
fn quote(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned())
}
