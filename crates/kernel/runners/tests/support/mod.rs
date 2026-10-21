//! Fake harness and clock for the runner tests.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;
use std::time::Duration;

use osq_core::Event;
use osq_kernel_runners::{Clock, Harness, HarnessExit, StartError, StartRequest};

/// What one fake start does.
#[derive(Debug, Clone, PartialEq)]
pub enum StartScript {
    /// The start cannot run and returns this error.
    Error(String),
    /// The start gives these events and exits this way.
    Run {
        /// The events the fake gives during the start.
        events: Vec<Event>,
        /// How the fake's process exits.
        exit: HarnessExit,
    },
}

/// What a fake harness saw across its starts.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FakeRecord {
    /// Every start request the fake received, in order.
    pub requests: Vec<StartRequest>,
}

/// A harness that plays a script of starts and records each request.
#[derive(Debug, Clone)]
pub struct FakeHarness {
    /// The starts to play, in order.
    scripts: Vec<StartScript>,
    /// The names this harness reads for its model.
    agent_env: Vec<String>,
    /// What the harness saw.
    record: Rc<RefCell<FakeRecord>>,
}

impl FakeHarness {
    /// Builds a fake that plays `scripts` and reads `agent_env`.
    #[must_use]
    pub fn new(scripts: Vec<StartScript>, agent_env: &[&str]) -> Self {
        Self {
            scripts,
            agent_env: agent_env.iter().map(|name| (*name).to_owned()).collect(),
            record: Rc::new(RefCell::new(FakeRecord::default())),
        }
    }

    /// The record this fake shares with the test.
    #[must_use]
    pub fn record(&self) -> Rc<RefCell<FakeRecord>> {
        Rc::clone(&self.record)
    }
}

impl Harness for FakeHarness {
    /// Returns the harness's model environment names.
    fn agent_env(&self) -> Vec<String> {
        self.agent_env.clone()
    }

    /// Plays the next scripted start, recording the request and giving events.
    fn start(
        &mut self,
        request: &StartRequest,
        on_event: &mut dyn FnMut(Event),
    ) -> Result<HarnessExit, StartError> {
        let mut record = self.record.borrow_mut();
        record.requests.push(request.clone());
        let index = record.requests.len() - 1;
        drop(record);
        match self.scripts.get(index).cloned() {
            Some(StartScript::Error(message)) => Err(StartError { message }),
            Some(StartScript::Run { events, exit }) => {
                for event in events {
                    on_event(event);
                }
                Ok(exit)
            }
            None => panic!("fake harness has no start {index}"),
        }
    }
}

/// A clock with a fixed time that records every wait without sleeping.
#[derive(Debug, Clone)]
pub struct FakeClock {
    /// The time this clock always reads.
    now_ms: i64,
    /// Every duration the runner waited, in order.
    waits: Rc<RefCell<Vec<Duration>>>,
}

impl FakeClock {
    /// Builds a clock that always reads `now_ms`.
    #[must_use]
    pub fn new(now_ms: i64) -> Self {
        Self {
            now_ms,
            waits: Rc::new(RefCell::new(Vec::new())),
        }
    }

    /// Every duration the runner waited, in order.
    #[must_use]
    pub fn waits(&self) -> Vec<Duration> {
        self.waits.borrow().clone()
    }
}

impl Clock for FakeClock {
    /// Returns the fixed time.
    fn now_ms(&self) -> i64 {
        self.now_ms
    }

    /// Records the wait without sleeping.
    fn wait(&mut self, duration: Duration) {
        self.waits.borrow_mut().push(duration);
    }
}

/// Builds a harness exit from its code and timeout flag.
#[must_use]
pub fn exit(exit_code: i32, timed_out: bool) -> HarnessExit {
    HarnessExit {
        exit_code,
        timed_out,
    }
}

/// Builds a source or extra environment map from literal pairs.
#[must_use]
pub fn env_map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
        .collect()
}
