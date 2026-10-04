## ADDED Requirements

### Requirement: Approve review document
`WebChange` SHALL carry `review`, a `WebReview` for an active change without
`.run/approved` and null for every other change. `getWebChange` SHALL always
set it; the type declares it optional so documents built before it stay
valid, and a missing `review` SHALL mean the same as null.

A `WebReview` SHALL hold the proposal's `goal`, `nonGoals`, `surface`,
`decisions`, `humanSteps` (the whole `## Human steps` section) and `contract`
as trimmed text with HTML comments removed, empty when absent; `deltas`; the
change's approval `digest` with its `flags`; and `digestText`, the digest body
`formatApprovalDigest` renders.

`deltas` SHALL hold one entry per capability folder under the change's
`specs/` with a `spec.md`, sorted by name, each listing its requirements in
the order added, modified, removed, renamed, and within each in delta order.
Each requirement SHALL carry its `operation`, its `name` (the new name for a
rename), `from` (the old name for a rename, else null), `proposed` (the
delta's verbatim block for added and modified, else null), and `living` (the
verbatim block `osq spec <capability> <requirement>` prints for the living
requirement it modifies, removes or renames, null for added or when no living
requirement matches). No field SHALL be estimated or diffed.

#### Scenario: Modified requirement carries its living text
- **WHEN** an unapproved change's delta modifies a living requirement
- **THEN** its review entry holds the proposed block and the living block `osq spec` prints

#### Scenario: Added, removed and renamed requirements
- **WHEN** the delta adds one requirement, removes one living requirement and renames another
- **THEN** the added entry has a null `living`, the removed entry has a null `proposed` and the living block, and the renamed entry has `from`, the new `name` and the old living block

#### Scenario: Proposal sections without template comments
- **WHEN** the proposal's Surface section holds the template's HTML comment and one line
- **THEN** `review.surface` is that line alone

#### Scenario: Approved change has no review
- **WHEN** the change has `.run/approved`, or is archived or rejected
- **THEN** `review` is null

### Requirement: Approve review view
For a change document with a `review`, the change view SHALL show, after the
header and brief, the sections `Goal`, `Non-goals`, `Surface`, `Decisions`,
`Human steps` and `Contract`, then `Deltas`, then the task table, then
`Approval digest`, then the actions. Section and requirement text SHALL be
plain preformatted text that wraps at narrow widths; no Markdown is rendered.
An empty section SHALL show `None`.

Each delta requirement SHALL show its operation and name, with the living
text and the proposed text side by side, stacked at narrow widths. An added
requirement's living side SHALL read `New requirement`, a removed one's
proposed side `Removed`, and a renamed one shows `Renamed from <from>` with
the living text. A requirement with no living match SHALL say so.

The digest section SHALL show `digestText`. When the dashboard has actions,
each flag's label and excerpt SHALL show inside the Approve button's item, or
above the buttons when there is no approve action; without actions, the
digest section SHALL list the flags. A change document without a `review`
SHALL render exactly as before this requirement.

#### Scenario: Review in order
- **WHEN** the change view renders a document with a review
- **THEN** the headings appear in the order Goal, Non-goals, Surface, Decisions, Human steps, Contract, Deltas, Tasks, Approval digest

#### Scenario: Flag beside Approve
- **WHEN** the actions hold `approve` and the review digest has a flag
- **THEN** the flag's label and excerpt render inside the Approve button's item

#### Scenario: Reviewed change unchanged
- **WHEN** the change view renders a document whose `review` is null or missing
- **THEN** the markup equals the markup it rendered before this requirement

#### Scenario: Phone width
- **WHEN** the review is viewed at a narrow width
- **THEN** its text wraps and each living and proposed pair stacks without horizontal page scroll
