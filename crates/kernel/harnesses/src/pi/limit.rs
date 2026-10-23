//! The account-limit errors pi refuses to retry, plus `DeepSeek`'s balance error.

/// The non-retryable account-limit texts, in lower case.
const USAGE_LIMIT_TEXTS: &[&str] = &[
    "gousagelimiterror",
    "freeusagelimiterror",
    "monthly usage limit reached",
    "available balance",
    "insufficient_quota",
    "out of budget",
    "quota exceeded",
    "billing",
    "insufficient balance",
];

/// Whether an error message names an account limit, ignoring ASCII case.
pub(super) fn is_usage_limit(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    USAGE_LIMIT_TEXTS.iter().any(|text| error.contains(text))
}
