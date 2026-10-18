//! The digest rule of rust-specs "TypeScript parse parity".

use serde_json::Value;

/// The prefix that stands in for a digested long string.
const DIGEST_PREFIX: &str = "fnv1a64:";

/// The longest string left as written, counted in UTF-16 code units.
const MAX_LITERAL_UNITS: usize = 64;

/// The 64-bit FNV-1a offset basis.
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;

/// The 64-bit FNV-1a prime.
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

/// Digests a parsed value: every string over 64 UTF-16 code units becomes its
/// `fnv1a64:` hash, while object keys, `path` and `capability` stay as written.
#[must_use]
pub fn digest(value: &Value) -> Value {
    match value {
        Value::String(text) => Value::String(digest_text(text)),
        Value::Array(items) => Value::Array(items.iter().map(digest).collect()),
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, item)| (key.clone(), digest_field(key, item)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Digests one object field's value, leaving `path` and `capability` alone.
fn digest_field(key: &str, value: &Value) -> Value {
    if key == "path" || key == "capability" {
        value.clone()
    } else {
        digest(value)
    }
}

/// A string as written, or its digest when longer than 64 UTF-16 code units.
fn digest_text(text: &str) -> String {
    if text.encode_utf16().count() > MAX_LITERAL_UNITS {
        let hash = fnv1a64(text.as_bytes());
        format!("{DIGEST_PREFIX}{hash:016x}")
    } else {
        text.to_string()
    }
}

/// The 64-bit FNV-1a hash of some bytes.
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = FNV_OFFSET;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}
