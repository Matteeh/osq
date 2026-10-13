# Tasks

## 1. Banned words

- [x] 1. When osq.config.ts sets or omits bannedWords, the resolved config holds the project's bans or none
- [x] 2. When osq lint runs on a change whose task scope reaches a banned word's paths, it warns about each code span, fenced line or scenario quote holding the word
- [x] 3. When osq's own config bans skipped in src, the ban test reads that ban from config
- [x] 4. When osq init writes the planner block, planners are told banned words are listed in bannedWords and that lint warns about them
