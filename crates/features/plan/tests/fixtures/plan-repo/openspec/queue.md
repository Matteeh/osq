# Fixture queue

Text before the first item belongs to no item.

## [alpha] Alpha comes first

Depends on: nothing

### Goal

Alpha is landed.
## [beta] Beta builds on alpha

Depends on: alpha
Fixes: alpha

### Goal

Beta is the next item to plan.

### Requirements

- Beta keeps every line of its brief, word for word.
## [gamma] Gamma waits on beta

Depends on: beta

### Goal

Gamma waits until beta lands.
