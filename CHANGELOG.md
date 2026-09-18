# Changelog

All notable changes to `osq` are documented in this file.

## [0.1.0] - 2026-09-18

Initial release providing spec-driven development CLI, task verification gates, and observability:
- Core spec queue architecture, folder hashing, cryptographic approval, and state derivation (001, 002).
- Reactive watcher loop, exclusive locking, stale lock reaping, and multi-task sequential execution (003, 004).
- Inspection and reporting CLI commands: osq status, osq show, and osq report with token economics (005, 006, 007, 010).
- Multi-harness adapters: Agy and OpenCode adapters with stream-json event parsing and verification preflight (008).
- Observability and lifecycle tracking: PID propagation, unified leveled stderr logging, tool event streaming, and stream text result synthesis (009, 011).
- Watch terminal UX: interactive single-line footer with animated spinner, live progress counters, and curated permanent info stream (012).
