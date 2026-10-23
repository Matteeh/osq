//! Starting pi through the process runner and translating its stream.

use std::collections::BTreeMap;
use std::time::Duration;

use osq_core::event::Event;
use osq_kernel_config::Config;
use osq_kernel_runners::{Harness, HarnessExit, StartError, StartRequest};

use super::preflight::{PiReady, resolve_pi_binary};
use super::{PiSettings, PiStreamState, pi_args, pi_line_events};
use crate::process::{ProcessOutcome, ProcessSpec, run_process_until};

/// The names pi reads for its model and credentials, in TypeScript's order.
const AGENT_ENV: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_RESOURCE_NAME",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_DEPLOYMENT_NAME_MAP",
    "DEEPSEEK_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "CEREBRAS_API_KEY",
    "XAI_API_KEY",
    "FIREWORKS_API_KEY",
    "TOGETHER_API_KEY",
    "OPENROUTER_API_KEY",
    "AI_GATEWAY_API_KEY",
    "ZAI_API_KEY",
    "MISTRAL_API_KEY",
    "MINIMAX_API_KEY",
    "MOONSHOT_API_KEY",
    "OPENCODE_API_KEY",
    "KIMI_API_KEY",
    "PI_CODING_AGENT_DIR",
];

/// The stderr text that marks a missing pi credential.
const MISSING_KEY_MARKER: &str = "No API key found";

/// The provider named when the settings name none.
const DEFAULT_PROVIDER: &str = "default";

/// The error text used when a task run times out.
const TIMEOUT_ERROR: &str = "Task execution timed out";

/// The pi adapter for the runners kernel's harness port.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PiHarness {
    /// The pi program to start.
    bin: String,
    /// The provider, model and thinking pi runs with.
    settings: PiSettings,
    /// How long the runner waits after pi settles or exits.
    kill_grace: Duration,
    /// The version preflight read for this program, when it read one.
    version: Option<String>,
}

impl PiHarness {
    /// Creates a harness that starts `bin` with `settings` and `kill_grace`.
    ///
    /// Implements: rust-harnesses/pi-harness
    #[must_use]
    pub fn new(bin: String, settings: PiSettings, kill_grace: Duration) -> Self {
        Self {
            bin,
            settings,
            kill_grace,
            version: None,
        }
    }

    /// Builds a harness from the loaded config and the caller's variables.
    ///
    /// Implements: rust-harnesses/pi-harness-from-config
    #[must_use]
    pub fn from_config(config: &Config, env: &BTreeMap<String, String>) -> Self {
        Self::new(
            resolve_pi_binary(config.pi.bin.as_deref(), env),
            PiSettings::from_config(&config.pi),
            config.timeouts.harness_kill_grace,
        )
    }

    /// Returns this harness carrying the version `ready` read, when it read one.
    ///
    /// Implements: rust-harnesses/pi-harness
    #[must_use]
    pub fn with_preflight(mut self, ready: &PiReady) -> Self {
        self.version = if ready.version.trim().is_empty() {
            None
        } else {
            Some(ready.version.clone())
        };
        self
    }

    /// Builds the settings for one start, preferring the request's model.
    ///
    /// Implements: rust-harnesses/pi-harness
    fn start_settings(&self, request: &StartRequest) -> PiSettings {
        PiSettings {
            provider: self.settings.provider.clone(),
            model: request
                .model
                .clone()
                .or_else(|| self.settings.model.clone()),
            thinking: self.settings.thinking.clone(),
        }
    }

    /// Builds the process request for one pi start.
    ///
    /// Implements: rust-harnesses/pi-harness
    fn process_spec(&self, request: &StartRequest) -> ProcessSpec {
        ProcessSpec {
            program: self.bin.clone(),
            args: pi_args(&self.start_settings(request), &request.prompt),
            cwd: request.cwd.clone(),
            env: request.env.clone(),
            timeout: request.timeout,
            kill_grace: self.kill_grace,
        }
    }

    /// Describes why a start that did not settle failed, in TypeScript's order.
    ///
    /// Implements: rust-harnesses/pi-harness
    fn failure(&self, outcome: &ProcessOutcome, settled: bool) -> Option<String> {
        if settled || outcome.exit_code == 0 {
            return None;
        }
        if outcome.stderr.contains(MISSING_KEY_MARKER) {
            let provider = self
                .settings
                .provider
                .as_deref()
                .map(str::trim)
                .filter(|provider| !provider.is_empty())
                .unwrap_or(DEFAULT_PROVIDER);
            return Some(format!(
                "{}\nPi credentials are missing. Run: pi auth check --provider {provider}",
                outcome.stderr.trim()
            ));
        }
        if outcome.timed_out {
            return Some(TIMEOUT_ERROR.to_owned());
        }
        if outcome.stderr.trim().is_empty() {
            None
        } else {
            Some(outcome.stderr.clone())
        }
    }
}

impl Harness for PiHarness {
    /// Returns the names pi reads for its model and credentials.
    ///
    /// Implements: rust-harnesses/pi-harness
    fn agent_env(&self) -> Vec<String> {
        AGENT_ENV.iter().map(|name| (*name).to_owned()).collect()
    }

    /// Returns the version preflight read for the program, when it read one.
    ///
    /// Implements: rust-harnesses/pi-harness
    fn harness_version(&self) -> Option<String> {
        self.version.clone()
    }

    /// Starts one pi task and gives each translated stdout line to `on_event`.
    ///
    /// Implements: rust-harnesses/pi-harness
    fn start(
        &mut self,
        request: &StartRequest,
        on_event: &mut dyn FnMut(Event),
    ) -> Result<HarnessExit, StartError> {
        let mut state = PiStreamState::default();
        let project_root = request.cwd.to_string_lossy().into_owned();
        let spec = self.process_spec(request);
        let outcome = run_process_until(&spec, &mut |line| {
            for event in pi_line_events(line, &project_root, &mut state) {
                on_event(event);
            }
            state.settled()
        });
        match outcome {
            Err(error) => Err(StartError {
                message: error.to_string(),
            }),
            Ok(outcome) => {
                let settled = state.settled();
                let error = self.failure(&outcome, settled);
                if settled {
                    Ok(HarnessExit {
                        exit_code: 0,
                        timed_out: false,
                        error,
                    })
                } else {
                    Ok(HarnessExit {
                        exit_code: outcome.exit_code,
                        timed_out: outcome.timed_out,
                        error,
                    })
                }
            }
        }
    }
}
