//! Why pi preflight refused to let a task start.

use std::fmt;

/// A failed pi preflight.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PiPreflightError {
    /// The pi binary could not start or did not answer its version probe.
    Binary {
        /// The program preflight tried.
        bin: String,
    },
    /// The provider's credentials are not ready.
    Credentials {
        /// The provider whose credentials were checked.
        provider: String,
        /// The reason the credentials are not ready.
        detail: String,
    },
}

impl fmt::Display for PiPreflightError {
    /// Writes the error text TypeScript writes for the same failure.
    ///
    /// Implements: rust-harnesses/pi-preflight
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Binary { bin } => {
                write!(formatter, "Pi binary not found or failed: {bin}")
            }
            Self::Credentials { provider, detail } => write!(
                formatter,
                "Pi credentials not ready for provider {provider}: {detail}. Run: pi auth check --provider {provider}"
            ),
        }
    }
}

impl std::error::Error for PiPreflightError {}
