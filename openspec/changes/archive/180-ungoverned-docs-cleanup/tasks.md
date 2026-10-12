# Tasks

## 1. Tests stop reading README and the repository's .env.example

- [x] 1. When the test suite runs, no test file exists only to read README prose
- [x] 2. When the harness and scaffold tests run, they check the scaffolded files and never the README or the repository's .env.example
- [x] 3. When the gate and steering tests run, they check the planner block, config and CHANGELOG and never the README
- [x] 4. When the tests of osq's own config, ADRs and scaffold run, they never read the README
- [x] 5. When the command, report and product description tests run, they check the help, package.json and program output and never the README
