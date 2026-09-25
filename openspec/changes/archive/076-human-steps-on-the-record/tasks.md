# Tasks

## 1. Next step

- [x] 1. When a change folder's state is read, one next-step function names its state and command, and osq status prints it

## 2. Recording

- [x] 2. When a change archives with after-landing steps or a check, the archived event records it, and osq check and osq verified append their events

## 3. Dependents

- [x] 3. When a dependency is verification pending or failed, depends_on, the queue and osq plan --next treat it as not landed

## 4. Digest

- [x] 4. When a proposal has steps before approval, the approval digest lists them first

## 5. Inbox

- [x] 5. When the inbox lists changes, it shows unplanned templates as needing planning, flags steps before approval, and lists pending and failed verification

## 6. Plan and approve

- [x] 6. When osq plan hands off a change or osq approve refuses one, it prints the change's next step

## 7. Show

- [x] 7. When osq show runs, it prints the change's next step and its verification history

## 8. Report

- [x] 8. When osq report runs, it counts after-landing checks by outcome and the pending ones

## 9. Planner guidance

- [x] 9. When a planner writes Human steps, the planner block and the osq schema describe Before approval, After landing, and the check key
