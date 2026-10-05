# Tasks

## 1. Configuration and the role

- [x] 1. When osq.config.ts sets a validator block, defineConfig resolves it with its own required model, and ADR 010 records the role
- [x] 2. When the validator is on, osq doctor compares its model with the executor's, init shows the block as a comment, and osq turns it on for itself

## 2. Running the validator

- [x] 3. When patch is given a base commit, it diffs the tree against that commit
- [x] 4. When osq prepares a validator run, it lists the scenarios to judge, the diff and the tests, builds the prompt, and reads the findings strictly
- [x] 5. When a change archives with a validator on, osq runs it once, puts back anything it edits, and records its findings without stopping the change

## 3. Reading the findings

- [x] 6. When an archived change has a validator_ran event, osq show prints the validation
- [x] 7. When archived changes have validator_ran events, osq report counts changes validated and findings per change
