# Tasks

## 1. Core change ids

- [x] 1. When a Rust command reads a change id, core's parse_change_id accepts only the change's number, its full folder name or, for show, its slug, and refuses anything else with a message naming the input and the accepted forms

## 2. Land

- [x] 2. When land, sync or message gets a change id, the land feature matches folders only through core and refuses an id core refuses with core's message

## 3. Approve and reject

- [x] 3. When approve or reject gets a change id, the approve feature matches folders only through core and refuses an id core refuses with core's message

## 4. Lint and run

- [x] 4. When lint or run gets a change id, each feature matches folders only through core and refuses an id core refuses with core's message

## 5. Archive, retry and plan

- [x] 5. When archive, retry or plan gets a change id, each feature matches folders only through core and refuses an id core refuses with core's message

## 6. Show and inbox

- [x] 6. When show gets a change id or the inbox reads an autopilot stop's change, each feature matches folders only through core, and show refuses an id core refuses with core's message
