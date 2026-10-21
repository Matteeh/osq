## ADDED Requirements

### Requirement: Pi harness from config
`PiSettings::from_config(pi: &PiConfig) -> PiSettings` in
`osq-kernel-harnesses` SHALL copy the rust-config `PiConfig`'s
`provider`, `model` and `thinking`. `PiHarness::from_config(config:
&Config, env: &BTreeMap<String, String>) -> PiHarness` SHALL equal
`PiHarness::new` with `resolve_pi_binary(config.pi.bin.as_deref(), env)`,
`PiSettings::from_config(&config.pi)` and
`config.timeouts.harness_kill_grace`. `PiHarness` SHALL derive
`PartialEq` and `Eq` as well as `Debug` and `Clone`.

#### Scenario: Pi harness built from osq.toml
- **WHEN** `PiHarness::from_config` runs with `parse_config` of the row's text and the row's `OSQ_PI_PATH`
- **THEN** it equals `PiHarness::new` with the row's program, settings and kill grace:

| Text | `OSQ_PI_PATH` | Program | Provider | Model | Thinking | Kill grace |
|---|---|---|---|---|---|---|
| empty | not set | `pi` | none | none | none | 5000 ms |
| empty | `/env/pi` | `/env/pi` | none | none | none | 5000 ms |
| `[pi]\nbin = "/opt/pi/bin/pi"\nprovider = "deepseek"\nmodel = "deepseek/deepseek-flash"\nthinking = "high"` | `/env/pi` | `/opt/pi/bin/pi` | `deepseek` | `deepseek/deepseek-flash` | `high` | 5000 ms |
| `[pi]\nmodel = "m1"\n[timeouts]\nharnessKillGracePeriodMs = 300` | not set | `pi` | none | `m1` | none | 300 ms |
