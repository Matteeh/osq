import YAML from 'yaml';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  try {
    const data = YAML.parse(match[1]) || {};
    return {
      data: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {},
      body: match[2] || '',
    };
  } catch {
    return { data: {}, body: content };
  }
}

export interface SpecFeatures {
  readonly reads: string[];
  readonly writes: string[];
}

export interface SpecData {
  readonly title: string;
  readonly dependsOn: string[];
  readonly features: SpecFeatures;
  readonly goal: string;
  readonly contract: string;
  readonly contractTablesCount: number;
  readonly nonGoals: string;
  readonly delta: string;
  readonly raw: string;
}

function extractSection(body: string, heading: string): string {
  const regex = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=(?:\\n##\\s+|$))`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : '';
}

function countMarkdownTables(text: string): number {
  const tableRegex = /\|[^\n]+\|\r?\n\|[-:\s|]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+/g;
  const matches = text.match(tableRegex);
  return matches ? matches.length : 0;
}

export function parseSpecMd(content: string): SpecData {
  const { data, body } = parseFrontmatter(content);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const dependsOn = Array.isArray(data.depends_on)
    ? data.depends_on.map((d: unknown) => {
        const str = String(d).trim();
        const num = Number.parseInt(str, 10);
        return !Number.isNaN(num) ? String(num).padStart(3, '0') : str;
      })
    : [];

  const rawFeatures = (data.features as Record<string, unknown>) || {};
  const reads = Array.isArray(rawFeatures.reads)
    ? rawFeatures.reads.map((r: unknown) => String(r).trim())
    : [];
  const writes = Array.isArray(rawFeatures.writes)
    ? rawFeatures.writes.map((w: unknown) => String(w).trim())
    : [];

  const goal = extractSection(body, 'Goal');
  const contract = extractSection(body, 'Contract');
  const nonGoals = extractSection(body, 'Non-goals');
  const delta = extractSection(body, 'Delta');

  return {
    title,
    dependsOn,
    features: { reads, writes },
    goal,
    contract,
    contractTablesCount: countMarkdownTables(contract),
    nonGoals,
    delta,
    raw: content,
  };
}

export interface TaskData {
  readonly title: string;
  readonly verify: string;
  readonly scope: string[];
  readonly entry: string[];
  readonly skills: string[];
  readonly acceptance: string[];
  readonly raw: string;
}

export function parseTaskMd(content: string): TaskData {
  const { data, body } = parseFrontmatter(content);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const verify = typeof data.verify === 'string' ? data.verify.trim() : '';

  const scope = Array.isArray(data.scope) ? data.scope.map((s: unknown) => String(s).trim()) : [];
  const entry = Array.isArray(data.entry) ? data.entry.map((e: unknown) => String(e).trim()) : [];
  const skills = Array.isArray(data.skills)
    ? data.skills.map((s: unknown) => String(s).trim())
    : [];

  const acceptanceSection = extractSection(body, 'Acceptance') || body;
  const itemRegex = /^[*-]\s+\[[ xX]\]\s+(.+)$/gm;
  const matches = acceptanceSection.matchAll(itemRegex);
  const acceptance: string[] = [];

  for (const match of matches) {
    acceptance.push(match[1].trim());
  }

  return {
    title,
    verify,
    scope,
    entry,
    skills,
    acceptance,
    raw: content,
  };
}
