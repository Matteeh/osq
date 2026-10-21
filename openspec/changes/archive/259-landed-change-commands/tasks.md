# Tasks

## 1. Retry a land stop

- [x] 1. When osq retry <id> change names an archived change with a land stop, it clears the stop and commits the retry on the change's branch, so the next land runs again

## 2. Plan a finished change

- [x] 2. When osq plan <id> names an archived or landed change, it writes nothing and says how to start new work instead of creating a change folder
