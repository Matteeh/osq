# Tasks

## 1. Provider outages

- [x] 1. When a task's model provider stops answering, the task dies as provider_unavailable, early, and quoting the provider's error
- [x] 2. When a task died of provider_unavailable, the watcher waits, retries it on its own budget, and never marks it stuck
