# Tasks

## 1. Query output

- [x] 1. When the report feature runs query, it prints TypeScript's table list and rows from the Rust read model, and a select SQLite cannot run fails with TypeScript's text

## 2. Query refusals

- [x] 2. When the report feature runs a query that would write, read a hidden table or hold a second statement, it refuses it with TypeScript's message before building the read model
