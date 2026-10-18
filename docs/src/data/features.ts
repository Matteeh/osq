/**
 * Feature cards. `available` lists only what ships in the current npm release;
 * `roadmap` is what the Rust rebuild adds. Move a card across when it ships, never before.
 */
export interface Feature {
  title: string;
  body: string;
  /** the command, file or term a reader can look up, shown in mono */
  ref?: string;
}

export const available: Feature[] = [
  {
    title: 'Approval before anything runs',
    body: 'Every plan waits for you. Before you approve, osq shows the goal, each task, and flags like a shared file or a removed requirement.',
    ref: 'osq approve',
  },
  {
    title: 'Tests decide, not the agent',
    body: "osq runs each task's tests in its own process after the agent exits. Only a pass marks the task done, and the whole change must stay green after every task.",
    ref: '.run/done/ · .run/dead/',
  },
  {
    title: 'Agents stay in their lane',
    body: 'Each task lists the files it may change. An agent that edits anything else, touches git, or quietly changes a test fails the task.',
    ref: 'scope · tests.modify',
  },
  {
    title: 'Retries that learn',
    body: 'A failed task gets one more try with the exact failure in its prompt. If it fails the same way twice, osq stops and asks you to adjust the plan.',
    ref: 'stuck · steering',
  },
  {
    title: 'Each change on its own branch',
    body: "Changes run in their own git worktree. When you're happy, one command merges it into your default branch. osq never rewrites history.",
    ref: 'osq land',
  },
  {
    title: 'Approve from your phone',
    body: "Run osq on a server and it keeps working while you're away. A dashboard shows what needs you, and approve, retry and land are one tap.",
    ref: 'osq server start',
  },
  {
    title: 'Specs that stay true',
    body: 'Your project keeps living specs of what it does. They only change when an approved change lands, so they always describe the code you have.',
    ref: 'openspec/specs/',
  },
  {
    title: 'A full audit trail',
    body: 'Every spawn, test run, retry and decision is an append-only file in your repo. Ask why a task failed last month with a single query.',
    ref: 'osq report · osq query',
  },
  {
    title: 'A second opinion',
    body: 'An optional reviewer on a different model checks the finished change against its specs before it lands.',
    ref: 'validator',
  },
];

export const roadmap: Feature[] = [
  { title: 'Many changes at once', body: 'A queue that runs as many agents as there is ready work, and explains why anything is waiting.' },
  { title: 'Agents set up in a UI', body: 'Pick the agent and model for each role, from planner to reviewer, without editing config by hand.' },
  { title: 'Spend limits', body: "Hard caps per agent, model and day, so a runaway task can't eat your budget." },
  { title: 'Choose how much is automatic', body: 'Decide per step whether you approve, approve only when green, or let osq go ahead. Core checks stay on.' },
  { title: 'One install', body: 'A single download with no Node.js needed, for laptops and servers alike.' },
  { title: 'Self-improving process', body: 'osq studies its own history and proposes better plans and checks, always as a change you approve.' },
];
