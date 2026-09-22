---
planner: gpt-5
date: 2026-09-21
---

# Repository record in planning

Feed this repository's own execution record back into planning and show task
size against outcome in the delivery report.

Measures events since change 026 already record task scope size at start and
end. The useful evidence now is whether measured task sizes pass on their first
attempt, how often they retry, and how long they take. Surface that evidence in
scope-file and acceptance-line buckets, and put a concise record from the 20
most recent archived changes into the planner's opening prompt.

The record must remain local and outcome-only. It may contain aggregates, task
titles, change identifiers, and dead reasons, but never result text or diffs.
When fewer than five measured tasks exist, say the record is too small and stop.
Report when the largest first-attempt pass is near a configured scope or
acceptance limit, but leave every limit change to a human.
