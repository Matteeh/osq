# Tasks

## 1. Default-branch triggers

- [x] 1. When the default branch stops a change at sync, the stop carries its own reason and the change needs steering
- [x] 2. When a land stops on a steering trigger, osq commits the stop on the change's branch and refuses to land it until it is steered
- [x] 3. When an archived change needs steering, osq finds it, and the inbox, the dispatcher, and its next step show osq plan <id> instead of osq land <id>

## 2. Steering them

- [x] 4. When a human plans or lints a change the default branch stopped, osq writes the prompt where it is, with the default branch's requirement text and what approval will do
- [x] 5. When a human approves the revised plan of a change the default branch stopped, osq restarts or merges its branch and the run continues
- [x] 6. When a user reads osq's guidance, it says how a change the default branch stops is steered, and what approval does to its branch
