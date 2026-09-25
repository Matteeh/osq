# Tasks

## 1. Protocol wording

- [x] 1. When an executor can't finish within its scope, the protocol tells it to write ## Blocked, and the planner rules drop the expected retry

## 2. Blocked exit

- [x] 2. When an executor's result file states a real ## Blocked, the task dies with blocked and the verify doesn't run

## 3. Inbox

- [x] 3. When a task died blocked, the inbox shows its stated need and the reject-and-replan way forward

## 4. Automatic recertification

- [x] 4. When a later task that had the file in scope is the only thing that changed it, the watcher recertifies the earlier task itself

## 5. Report

- [x] 5. When osq report runs, it counts automatic recertifications apart from human ones and blocked deaths by reason
