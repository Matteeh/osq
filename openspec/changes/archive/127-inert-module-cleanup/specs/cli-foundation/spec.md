## ADDED Requirements

### Requirement: No inert stand-ins
No `.ts` or `.tsx` file under `src/` or `tests/` SHALL consist only of
comments, blank lines, and `export {};`. A change that removes a module SHALL
delete its file. `tests/no-inert-modules.test.ts` SHALL enforce the rule and
name each file that breaks it.

#### Scenario: Stand-in left behind
- **WHEN** a file under `src/` holds only a comment and `export {};`
- **THEN** `tests/no-inert-modules.test.ts` fails naming that file

#### Scenario: Removed modules deleted
- **WHEN** the files 123 left as stand-ins are deleted
- **THEN** `tests/no-inert-modules.test.ts` passes
