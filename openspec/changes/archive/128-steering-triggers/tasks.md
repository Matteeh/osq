# Tasks

## 1. Triggers

- [x] 1. When a change hits a steering trigger, osq derives it from the markers and the watcher leaves the change alone

## 2. One item, one action

- [x] 2. When a change needs steering, the inbox, the dispatcher, and its next step show it once with osq plan <id>
- [x] 3. When a human plans a change that needs steering, osq writes the prompt with the evidence into the change's own folder, and lint finds it there

## 3. Continue the run

- [x] 4. When a human approves the revised plan of a change that needs steering, osq seals it where the change runs and the run continues from the first task that is not done

## 4. Guidance

- [x] 5. When a user reads osq's guidance, it says when osq asks for steering and how to answer with osq plan and osq approve
