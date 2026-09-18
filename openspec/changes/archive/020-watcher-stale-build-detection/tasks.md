# Tasks

## 1. Build Identity Recording

- [x] 1. When tasks start or the watcher idles, the osq version with commit or dist hash is recorded

## 2. Stale Build Detection & Preflight

- [x] 2. When starting from a checkout with stale dist, the watcher exits non-zero unless allow-stale is passed

## 3. Reactive Dev Mode

- [x] 3. When dev mode is enabled, the watcher runs through tsx from src, restarting on source changes after finishing the running task
