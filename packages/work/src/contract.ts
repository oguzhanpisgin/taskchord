import {
  ISSUE_CONTRACT_VERSION,
  type IssueContract,
  type ParsedIssueBody,
} from "@taskchord/contracts";

const OPEN_MARKER = /^<!--\s*taskchord:contract\s+v=(\d+)\s+id=([A-Za-z0-9._-]{8,80})\s*-->$/iu;
const CLOSE_MARKER = /^<!--\s*\/taskchord:contract\s*-->$/iu;
const HEADING = /^##\s+(Outcome|Boundaries|Acceptance|Verification|Goal)\s*$/iu;

type BodyField = "outcome" | "boundaries" | "acceptance" | "verification" | "goal";

const FIELD_BY_HEADING: Record<string, BodyField> = {
  outcome: "outcome",
  boundaries: "boundaries",
  acceptance: "acceptance",
  verification: "verification",
  goal: "goal",
};

function normalize(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function trimBlankLines(value: string): string {
  return value.replace(/^\n+/u, "").replace(/\n+$/u, "");
}

function fenceToken(line: string): { character: "`" | "~"; length: number } | undefined {
  const match = /^\s*(`{3,}|~{3,})/u.exec(line);
  const token = match?.[1];
  if (token === undefined) {
    return undefined;
  }
  const character = token[0];
  return character === "`" || character === "~" ? { character, length: token.length } : undefined;
}

export function parseIssueBody(input: string): ParsedIssueBody {
  const body = normalize(input);
  const lines = body.split("\n");
  let openIndex = -1;
  let openMatch: RegExpExecArray | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = OPEN_MARKER.exec(lines[index] ?? "");
    if (match !== null) {
      openIndex = index;
      openMatch = match;
      break;
    }
  }
  if (openIndex < 0 || openMatch === null) {
    return { kind: "unstructured" };
  }

  const version = Number(openMatch[1]);
  if (!Number.isSafeInteger(version) || version !== ISSUE_CONTRACT_VERSION) {
    return { kind: "contract-newer", version };
  }
  const id = openMatch[2];
  if (id === undefined) {
    return { kind: "unstructured" };
  }

  let closeIndex = lines.findIndex((line, index) => index > openIndex && CLOSE_MARKER.test(line));
  if (closeIndex < 0) {
    closeIndex = lines.length;
  }
  const fieldLines: Record<BodyField, string[]> = {
    outcome: [],
    boundaries: [],
    acceptance: [],
    verification: [],
    goal: [],
  };
  const seen = new Set<BodyField>();
  let current: BodyField | undefined;
  let fence: { character: "`" | "~"; length: number } | undefined;
  for (let index = openIndex + 1; index < closeIndex; index += 1) {
    const line = lines[index] ?? "";
    const token = fenceToken(line);
    if (fence !== undefined) {
      if (current !== undefined) {
        fieldLines[current].push(line);
      }
      if (token?.character === fence.character && token.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (token !== undefined) {
      fence = token;
      if (current !== undefined) {
        fieldLines[current].push(line);
      }
      continue;
    }

    const heading = HEADING.exec(line);
    const field =
      heading?.[1] === undefined ? undefined : FIELD_BY_HEADING[heading[1].toLowerCase()];
    if (field !== undefined && !seen.has(field)) {
      seen.add(field);
      current = field;
      continue;
    }
    if (current !== undefined) {
      fieldLines[current].push(line);
    }
  }

  const prefix = lines.slice(0, openIndex).join("\n");
  const suffix = closeIndex < lines.length ? lines.slice(closeIndex + 1).join("\n") : "";
  return {
    kind: "contract",
    version: ISSUE_CONTRACT_VERSION,
    contract: {
      id,
      outcome: trimBlankLines(fieldLines.outcome.join("\n")),
      boundaries: trimBlankLines(fieldLines.boundaries.join("\n")),
      acceptance: trimBlankLines(fieldLines.acceptance.join("\n")),
      verification: trimBlankLines(fieldLines.verification.join("\n")),
      goal: trimBlankLines(fieldLines.goal.join("\n")),
      prefix,
      suffix,
    },
  };
}

const SECTIONS: ReadonlyArray<{ heading: string; field: BodyField }> = [
  { heading: "Outcome", field: "outcome" },
  { heading: "Boundaries", field: "boundaries" },
  { heading: "Acceptance", field: "acceptance" },
  { heading: "Verification", field: "verification" },
  { heading: "Goal", field: "goal" },
];

export function renderIssueBody(contract: IssueContract): string {
  const block: string[] = [
    `<!-- taskchord:contract v=${ISSUE_CONTRACT_VERSION} id=${contract.id} -->`,
    "",
  ];
  for (const section of SECTIONS) {
    block.push(`## ${section.heading}`, "", normalize(contract[section.field]), "");
  }
  block.push("<!-- /taskchord:contract -->");
  const prefix = normalize(contract.prefix);
  const suffix = normalize(contract.suffix);
  return `${prefix}${prefix.length > 0 ? "\n" : ""}${block.join("\n")}${suffix.length > 0 ? `\n${suffix}` : ""}`;
}

export function newContractTemplate(id: string): string {
  return renderIssueBody({
    id,
    outcome: "",
    boundaries: "",
    acceptance: "",
    verification: "",
    goal: "",
    prefix: "",
    suffix: "",
  });
}

export interface ContractDocument {
  title: string;
  body: string;
  parsedBody: ParsedIssueBody;
}

export function renderContractDocument(title: string, body: string): string {
  return `# ${title.replace(/[\r\n]+/gu, " ")}\n\n${normalize(body)}`;
}

export function parseContractDocument(document: string): ContractDocument {
  const normalized = normalize(document);
  const lines = normalized.split("\n");
  const firstLine = lines.shift() ?? "";
  const title = firstLine.startsWith("# ") ? firstLine.slice(2) : "";
  if (lines[0] === "") {
    lines.shift();
  }
  const body = lines.join("\n");
  return { title, body, parsedBody: parseIssueBody(body) };
}
