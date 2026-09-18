# Tasks

## 1. Capability Code Ownership Parsing & Schema Extension

- [x] 1. When capability specs are parsed, code ownership headers map globs while task frontmatter parses tests.modify

## 2. Specification Linter Validation for Ownership and Test Gating

- [x] 2. When change folders are linted, tests.modify schema with scope ownership boundaries are validated

## 3. Prompt Rule Injection for Harness Adapters

- [x] 3. When executor prompts are constructed, capability rules from written delta specs are injected

## 4. Test Modification Gating & undeclared_test_change Dead Reason

- [x] 4. When task execution touches tests without declaration, undeclared_test_change halts verification marking task dead

## 5. Status, Show, and Report Telemetry Categorization

- [x] 5. When undeclared_test_change occurs, status inspection with reporting format failure reasons plus metrics

## 6. Baseline Living Capabilities Alignment

- [x] 6. When capability deltas are applied, all five living capability specs declare code ownership blocks
