# Tasks

## 1. Clippy settings

- [ ] 1. When clippy checks a #[test] function, unwrap is allowed there and nowhere else

## 2. Fix every clippy hit, one crate at a time

- [ ] 2. When the harnesses kernel takes a piped child's stdout or stderr, it says why the pipe is there instead of unwrapping
- [ ] 3. When storage kernel test helpers fail a setup step, they panic with expect and a reason instead of unwrap
- [ ] 4. When vcs kernel test helpers fail a git setup step, they panic with expect and a reason instead of unwrap
- [ ] 5. When loop kernel tests share a support module or fail a setup step, the allow and the panic both say why
- [ ] 6. When sync kernel tests share a support module, its dead_code allow says why
- [ ] 7. When archive feature test helpers fail a setup step, they panic with expect and a reason instead of unwrap
- [ ] 8. When doctor feature test helpers fail a setup step, they panic with expect and a reason instead of unwrap
- [ ] 9. When inbox feature test helpers fail a setup step, they panic with expect and a reason instead of unwrap
- [ ] 10. When lint feature tests share a support module or fail a setup step, the allow and the panic both say why
- [ ] 11. When report feature tests share a support module or fail a setup step, the allow and the panic both say why
- [ ] 12. When approve feature tests share a support module, its dead_code allow says why
- [ ] 13. When land feature tests share a support module, its dead_code allow says why
- [ ] 14. When manual feature tests share a support module, its allow says why and it builds strings with format
- [ ] 15. When plan feature tests include a shared module, its dead_code allow says why
- [ ] 16. When retry feature tests share a support module, its dead_code allow says why
- [ ] 17. When run feature tests share support modules or build prompt text, every allow says why and strings use format
- [ ] 18. When show feature land tests build expected text, they use format instead of adding strings

## 3. Fix every rustdoc warning

- [ ] 19. When the report feature's docs build, its public run doc links no private item
- [ ] 20. When core's docs build, the event kind module's link to Event::kind resolves
- [ ] 21. When the CLI app's docs build, its crate doc has no redundant link target

## 4. Turn the checks on

- [ ] 22. When clippy checks the workspace, the eight new restriction lints are denied and ADR 023 says why
- [ ] 23. When the Rust workspace is verified, a rustdoc warning fails it
