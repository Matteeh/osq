## ADDED Requirements

### Requirement: Autopilot stop on the home view
The home view SHALL label an `autopilot-stopped` item `autopilot stopped` and
show ` — <reason>` after its title. Its title SHALL link to the change page
when `autopilotStopped.change` is not null, and be plain text when it is
null. A pure model file decides the route and the reason; the component only
renders them.

#### Scenario: Autopilot stopped label
- **WHEN** the label of the needs-you kind `autopilot-stopped` is read
- **THEN** it is `autopilot stopped`

#### Scenario: Stop rows on the home view
- **WHEN** the home view renders an `autopilot-stopped` item with this `autopilotStopped`
- **THEN** the row is this

| change | reason | row |
| --- | --- | --- |
| `"003"` | `halted` | links `003: Orders` to the change page, then reads ` — halted` |
| null | `not_approved` | shows `orders: Orders are totalled` with no link, then reads ` — not_approved` |
