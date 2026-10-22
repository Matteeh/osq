## ADDED Requirements

### Requirement: Pi usage limit
`pi_line_events` SHALL also give one `UsageLimit` event for a
`message_end` line whose `message.role` is `assistant`, whose
`message.stopReason` is `error` and whose `message.errorMessage` is a
non-empty string holding, in any ASCII letter case, one of pi 0.87.0's
account-limit texts: `GoUsageLimitError`, `FreeUsageLimitError`,
`Monthly usage limit reached`, `available balance`, `insufficient_quota`,
`out of budget`, `quota exceeded` or `billing`, the errors pi itself
refuses to retry because the account hit a limit, or DeepSeek's
`insufficient balance`. The event comes
after the `Text` and `Tokens` events "Pi stream events" gives for the
line, with `error` set to `errorMessage` and no `resetsAt`, since pi
reports no reset time. TypeScript's pi adapter writes no usage limit, so
this is the one event the Rust pi stream gives that TypeScript's
`processPiStdoutLine` does not; every other line still gives exactly
TypeScript's events.

#### Scenario: Pi usage limits
- **WHEN** `pi_line_events` reads each row's line with the project root `/work/project` and a fresh state
- **THEN** it gives the row's events, in order:

| Line | Events |
|---|---|
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"429 Monthly usage limit reached"}}` | `UsageLimit` with `error` `429 Monthly usage limit reached` |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"Error: INSUFFICIENT_QUOTA"}}` | `UsageLimit` with `error` `Error: INSUFFICIENT_QUOTA` |
| `{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"partial"}],"usage":{"input":1,"output":2},"stopReason":"error","errorMessage":"Out Of Budget this month"}}` | `Text` with `partial`; `Tokens` with `promptTokens` 1, `candidateTokens` 2 and `totalTokens` 3; `UsageLimit` with `error` `Out Of Budget this month` |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"402 Insufficient Balance"}}` | `UsageLimit` with `error` `402 Insufficient Balance` |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"503 overloaded"}}` | none |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"stop","errorMessage":"quota exceeded"}}` | none |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error"}}` | none |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":""}}` | none |
| `{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":42}}` | none |
| `{"type":"message_end","message":{"role":"user","content":[],"stopReason":"error","errorMessage":"billing"}}` | none |
