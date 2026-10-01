# Tasks

## 1. History query

- [x] 1. When osq builds the history tables, each archived change becomes rows, read through the index
- [x] 2. When someone runs osq query, it runs one SELECT on the history tables and refuses anything else
- [x] 3. When osq init writes the managed blocks, planners and executors are told to use osq query for history
