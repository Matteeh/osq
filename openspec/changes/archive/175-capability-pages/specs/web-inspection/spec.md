# Spec Delta: web-inspection

## ADDED Requirements

### Requirement: Docs document
`GET /api/docs` SHALL return the docs site `buildDocsSite(projectRoot,
config)` builds, as JSON, through the same read-only document table as
`/api/report`, `/api/graph`, `/api/system` and `/api/inbox`, and under
`/p/<project>/api/docs` on a server. `startWebServer` SHALL take an optional
`getDocs` like the other documents. The dashboard data layer SHALL load it for
the docs routes, `#/docs`, `#/docs/capabilities/<name>` and
`#/docs/adrs/<number>`, hold it as the snapshot's `docs`, and fetch it again
on a `changed` event while a docs route is open. A route name or number SHALL
be decoded like a change folder key, and an unusable one SHALL resolve to the
home route.

#### Scenario: Docs over HTTP
- **WHEN** the server runs over the docs fixture and `/api/docs` is requested
- **THEN** it answers 200 with the site whose `capabilities` are `invoices` and `pricing` and whose `adrs` are `001` to `004`

#### Scenario: Docs routes
- **WHEN** the hashes below are parsed
- **THEN** they resolve as below, and each route renders back to its hash:

| Hash | Route |
|---|---|
| `#/docs` | `docs` |
| `#/docs/capabilities/pricing` | `docs-capability` with name `pricing` |
| `#/docs/adrs/004` | `docs-adr` with number `004` |
| `#/docs/capabilities/a%2Fb` | home |

### Requirement: Docs view
The dashboard SHALL add a `Docs` link to its navigation, after `Graph`. On
`#/docs` it SHALL list the groups of the docs site in order, each a heading
with a link per capability and its purpose, then the ADRs, each a link with
its number, title and status. A capability route SHALL show the capability
page's group, purpose, requirements with their `shall` sentences and scenario
names, decisions with their rules and ADR links, Code ownership globs, the
code map when it is not null, and recent changes with their date and goal,
each change linking to its change view. An ADR route SHALL show its status,
a link to its successor when superseded, links to the capabilities it applies
to, its rule, and its body as preformatted text. A name or number the site
lacks SHALL show `No such page.` The view SHALL add no package, and at phone
width its text SHALL wrap instead of scrolling sideways.

#### Scenario: Docs index view
- **WHEN** the dashboard renders `#/docs` with the docs fixture's site
- **THEN** it shows the `billing` group before `ungrouped`, a link to `#/docs/capabilities/pricing`, and ADR 003 marked `superseded`

#### Scenario: Capability and ADR views
- **WHEN** the dashboard renders `#/docs/capabilities/pricing`, then `#/docs/adrs/003`, then `#/docs/adrs/999` with the docs fixture's site
- **THEN** the first shows `The engine SHALL price every unit in a quote at the tier its quantity falls in.`, `src/pricing/quote.ts:33` and a link to change `007`, the second shows a link to `#/docs/adrs/004`, and the third shows `No such page.`
