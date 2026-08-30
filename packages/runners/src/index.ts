import * as http from "node:http";
import type { ProbeResult, ProcessProbe } from "@taskchord/doctor";

export type RunnerAvailability = "unverified" | "ready" | "unavailable" | "incompatible";
export type SnapshotFreshness = "fresh" | "stale" | "unknown";
export type RepositoryAssociation = "current" | "other" | "unknown";
export type CodexAppServerAvailability = "supported" | "unsupported" | "unverified";

export const SYMPHONY_STATE_PATH = "/api/v1/state";
export const SYMPHONY_TIMEOUT_MS = 2_000;
export const SYMPHONY_MAX_RESPONSE_BYTES = 512 * 1_024;
export const SYMPHONY_MAX_ITEMS = 100;
export const SYMPHONY_STALE_AFTER_MS = 5 * 60 * 1_000;

export interface SymphonySettings {
  enabled: boolean;
  port: number;
}

export interface SymphonyAssociationSummary {
  current: number;
  other: number;
  unknown: number;
  truncated: boolean;
}

export interface SymphonyObservation {
  endpoint: string;
  availability: RunnerAvailability;
  freshness: SnapshotFreshness;
  observedAt: string;
  latencyMs?: number;
  generatedAt?: string;
  counts: {
    running?: number;
    blocked?: number;
    retrying?: number;
  };
  associations: SymphonyAssociationSummary;
  /** Repository identity used when the association counts were computed. */
  associationRepository?: string;
  reason?: string;
}

export interface CodexAppServerObservation {
  availability: CodexAppServerAvailability;
  codexVersion?: string;
  reason?: string;
}

export interface OptionalRunnerReport {
  schemaVersion: 1;
  symphony: SymphonyObservation;
  codexAppServer: CodexAppServerObservation;
  fallback: "native-handoff";
}

export interface SymphonyStateReader {
  read(endpoint: string): Promise<SymphonyHttpResponse>;
}

export interface SymphonyHttpResponse {
  statusCode: number;
  body: string;
  latencyMs: number;
}

interface StateItem {
  issueUrl?: string;
}

interface ParsedState {
  generatedAt: string;
  counts: SymphonyObservation["counts"];
  items: readonly StateItem[];
  truncated: boolean;
}

function nowIso(now: Date): string {
  return now.toISOString();
}

function emptyAssociations(): SymphonyAssociationSummary {
  return { current: 0, other: 0, unknown: 0, truncated: false };
}

export function isValidSymphonyPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

export function symphonyEndpoint(port: number): string {
  return `http://127.0.0.1:${port}${SYMPHONY_STATE_PATH}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseStateItem(value: unknown): StateItem | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.issue_url === "string" ? { issueUrl: value.issue_url } : {};
}

function parseState(value: unknown): ParsedState | undefined {
  if (!isRecord(value) || typeof value.generated_at !== "string" || !isRecord(value.counts)) {
    return undefined;
  }
  const collections = ["blocked", "running", "retrying"] as const;
  const present = collections.filter((name) => Array.isArray(value[name]));
  if (present.length === 0) return undefined;

  const counts: SymphonyObservation["counts"] = {};
  for (const name of collections) {
    const count = nonNegativeNumber(value.counts[name]);
    if (count !== undefined) counts[name] = count;
  }
  const rawItems = present.flatMap((name) => value[name] as unknown[]);
  const parsedItems = rawItems.map(parseStateItem);
  if (parsedItems.some((item) => item === undefined)) return undefined;
  return {
    generatedAt: value.generated_at,
    counts,
    items: (parsedItems as StateItem[]).slice(0, SYMPHONY_MAX_ITEMS),
    truncated: rawItems.length > SYMPHONY_MAX_ITEMS,
  };
}

function repositoryFromIssueUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return undefined;
    const match = /^\/([^/]+)\/([^/]+)\/issues\/\d+\/?$/u.exec(url.pathname);
    if (match?.[1] === undefined || match[2] === undefined) return undefined;
    return `${match[1]}/${match[2]}`;
  } catch {
    return undefined;
  }
}

export function associateSymphonyItems(
  items: readonly StateItem[],
  repository: string | undefined,
  truncated: boolean,
): SymphonyAssociationSummary {
  const associations = emptyAssociations();
  associations.truncated = truncated;
  for (const item of items) {
    const itemRepository =
      item.issueUrl === undefined ? undefined : repositoryFromIssueUrl(item.issueUrl);
    if (itemRepository === undefined || repository === undefined) {
      associations.unknown += 1;
    } else if (itemRepository.toLowerCase() === repository.toLowerCase()) {
      associations.current += 1;
    } else {
      associations.other += 1;
    }
  }
  return associations;
}

export function snapshotFreshness(generatedAt: string, now: Date): SnapshotFreshness {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs) || generatedAtMs > now.getTime()) return "unknown";
  return now.getTime() - generatedAtMs > SYMPHONY_STALE_AFTER_MS ? "stale" : "fresh";
}

function unavailableSymphony(
  endpoint: string,
  observedAt: string,
  availability: RunnerAvailability,
  reason: string,
): SymphonyObservation {
  return {
    endpoint,
    availability,
    freshness: "unknown",
    observedAt,
    counts: {},
    associations: emptyAssociations(),
    reason,
  };
}

export function createNodeSymphonyStateReader(): SymphonyStateReader {
  return {
    read(endpoint) {
      const url = new URL(endpoint);
      return new Promise((resolve, reject) => {
        const startedAt = performance.now();
        const request = http.request(
          {
            protocol: "http:",
            hostname: "127.0.0.1",
            port: Number(url.port),
            method: "GET",
            path: SYMPHONY_STATE_PATH,
            timeout: SYMPHONY_TIMEOUT_MS,
            headers: {},
          },
          (response) => {
            const chunks: Buffer[] = [];
            let total = 0;
            response.on("data", (chunk: Buffer) => {
              total += chunk.length;
              if (total > SYMPHONY_MAX_RESPONSE_BYTES) {
                request.destroy(new Error("Symphony state response exceeded 512 KiB."));
                return;
              }
              chunks.push(chunk);
            });
            response.on("end", () => {
              resolve({
                statusCode: response.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8"),
                latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
              });
            });
            response.on("error", reject);
          },
        );
        request.on("timeout", () =>
          request.destroy(new Error("Symphony state request timed out.")),
        );
        request.on("error", reject);
        request.end();
      });
    },
  };
}

export async function observeSymphony(
  settings: SymphonySettings,
  options: {
    reader?: SymphonyStateReader;
    repository?: string;
    now?: () => Date;
  } = {},
): Promise<SymphonyObservation> {
  const now = options.now?.() ?? new Date();
  const observedAt = nowIso(now);
  const port = settings.port;
  const endpoint = isValidSymphonyPort(port) ? symphonyEndpoint(port) : symphonyEndpoint(4000);
  if (!settings.enabled) {
    return unavailableSymphony(
      endpoint,
      observedAt,
      "unavailable",
      "Symphony checks are disabled in Settings.",
    );
  }
  if (!isValidSymphonyPort(port)) {
    return unavailableSymphony(
      endpoint,
      observedAt,
      "unverified",
      "Symphony port must be between 1 and 65535.",
    );
  }

  let response: SymphonyHttpResponse;
  try {
    response = await (options.reader ?? createNodeSymphonyStateReader()).read(endpoint);
  } catch {
    return unavailableSymphony(
      endpoint,
      observedAt,
      "unavailable",
      "Symphony state endpoint could not be reached.",
    );
  }
  if (response.statusCode !== 200) {
    return unavailableSymphony(
      endpoint,
      observedAt,
      "unavailable",
      `Symphony state endpoint returned HTTP ${response.statusCode}.`,
    );
  }
  let parsed: ParsedState | undefined;
  try {
    parsed = parseState(JSON.parse(response.body));
  } catch {
    parsed = undefined;
  }
  if (parsed === undefined) {
    return unavailableSymphony(
      endpoint,
      observedAt,
      "incompatible",
      "Symphony state did not match the supported preview shape.",
    );
  }
  return {
    endpoint,
    availability: "ready",
    freshness: snapshotFreshness(parsed.generatedAt, now),
    observedAt,
    latencyMs: response.latencyMs,
    generatedAt: parsed.generatedAt,
    counts: parsed.counts,
    associations: associateSymphonyItems(parsed.items, options.repository, parsed.truncated),
    ...(options.repository === undefined ? {} : { associationRepository: options.repository }),
  };
}

function versionFromProbe(result: ProbeResult): string | undefined {
  if (result.outcome !== "completed" || result.exitCode !== 0) return undefined;
  const version = result.stdout.trim();
  return version.length === 0 ? undefined : version;
}

export async function observeCodexAppServer(
  probe: ProcessProbe,
): Promise<CodexAppServerObservation> {
  const run = async (request: Parameters<ProcessProbe["run"]>[0]): Promise<ProbeResult> => {
    try {
      return await probe.run(request);
    } catch {
      return { outcome: "error", exitCode: null, stdout: "", stderr: "", durationMs: 0 };
    }
  };
  const version = await run({
    command: "codex",
    args: ["--version"],
    timeoutMs: 3_000,
    maxBufferBytes: 512 * 1_024,
  });
  const appServer = await run({
    command: "codex",
    args: ["app-server", "--help"],
    timeoutMs: 3_000,
    maxBufferBytes: 512 * 1_024,
  });
  const codexVersion = versionFromProbe(version);
  if (appServer.outcome === "completed" && appServer.exitCode === 0 && codexVersion !== undefined) {
    return { availability: "supported", codexVersion };
  }
  if (
    appServer.outcome === "not-found" ||
    (appServer.outcome === "completed" && appServer.exitCode !== 0)
  ) {
    return {
      availability: "unsupported",
      ...(codexVersion === undefined ? {} : { codexVersion }),
      reason: "This Codex installation does not support the App Server command.",
    };
  }
  return {
    availability: "unverified",
    ...(codexVersion === undefined ? {} : { codexVersion }),
    reason: "Codex App Server capability could not be verified.",
  };
}

export async function observeOptionalRunners(
  settings: SymphonySettings,
  probe: ProcessProbe,
  options: {
    reader?: SymphonyStateReader;
    repository?: string;
    now?: () => Date;
  } = {},
): Promise<OptionalRunnerReport> {
  const [symphony, codexAppServer] = await Promise.all([
    observeSymphony(settings, options),
    observeCodexAppServer(probe),
  ]);
  return { schemaVersion: 1, symphony, codexAppServer, fallback: "native-handoff" };
}
