import type { ProbeRequest, ProbeResult, ProcessProbe } from "@taskchord/doctor";
import { describe, expect, it } from "vitest";
import {
  createNodeSymphonyStateReader,
  observeCodexAppServer,
  observeOptionalRunners,
  observeSymphony,
  SYMPHONY_MAX_ITEMS,
  SYMPHONY_MAX_RESPONSE_BYTES,
  type SymphonyHttpResponse,
  type SymphonyStateReader,
  snapshotFreshness,
  symphonyEndpoint,
} from "./index.js";

function reader(response: SymphonyHttpResponse): SymphonyStateReader {
  return { read: async () => response };
}

function state(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    generated_at: "2026-08-30T12:00:00.000Z",
    counts: { running: 2, blocked: 1 },
    running: [
      {
        issue_identifier: "TASK-1",
        issue_url: "https://github.com/owner/repo/issues/1",
        last_message: "must never be persisted",
      },
    ],
    blocked: [{ issue_url: "https://github.com/other/repo/issues/2" }],
    ...overrides,
  });
}

function probe(results: readonly ProbeResult[]): ProcessProbe {
  const requests: ProbeRequest[] = [];
  return {
    async run(request) {
      requests.push(request);
      const result = results[requests.length - 1];
      if (result === undefined) throw new Error("Unexpected probe request.");
      return result;
    },
  };
}

const completed = (stdout: string): ProbeResult => ({
  outcome: "completed",
  exitCode: 0,
  stdout,
  stderr: "",
  durationMs: 1,
});

describe("optional runner observations", () => {
  it("reads only the fixed Symphony endpoint and retains only safe state summary", async () => {
    const calls: string[] = [];
    const fakeReader: SymphonyStateReader = {
      async read(endpoint) {
        calls.push(endpoint);
        return { statusCode: 200, body: state(), latencyMs: 17 };
      },
    };

    const result = await observeSymphony(
      { enabled: true, port: 4000 },
      {
        reader: fakeReader,
        repository: "owner/repo",
        now: () => new Date("2026-08-30T12:02:00.000Z"),
      },
    );

    expect(calls).toEqual(["http://127.0.0.1:4000/api/v1/state"]);
    expect(result).toMatchObject({
      availability: "ready",
      freshness: "fresh",
      counts: { running: 2, blocked: 1 },
      associations: { current: 1, other: 1, unknown: 0, truncated: false },
      associationRepository: "owner/repo",
    });
    expect(JSON.stringify(result)).not.toContain("last_message");
    expect(JSON.stringify(result)).not.toContain("TASK-1");
  });

  it("does not perform a request when disabled or misconfigured", async () => {
    const read = async (): Promise<SymphonyHttpResponse> => {
      throw new Error("A disabled check must not request Symphony.");
    };
    const disabled = await observeSymphony(
      { enabled: false, port: 4000 },
      { reader: { read }, now: () => new Date("2026-08-30T12:00:00.000Z") },
    );
    const invalid = await observeSymphony(
      { enabled: true, port: 0 },
      { reader: { read }, now: () => new Date("2026-08-30T12:00:00.000Z") },
    );
    expect(disabled.availability).toBe("unavailable");
    expect(invalid.availability).toBe("unverified");
    expect(invalid.endpoint).toBe(symphonyEndpoint(4000));
  });

  it("does not treat non-200, malformed, or structurally incompatible data as ready", async () => {
    const now = () => new Date("2026-08-30T12:00:00.000Z");
    const notFound = await observeSymphony(
      { enabled: true, port: 4000 },
      { reader: reader({ statusCode: 404, body: "", latencyMs: 1 }), now },
    );
    const malformed = await observeSymphony(
      { enabled: true, port: 4000 },
      { reader: reader({ statusCode: 200, body: "not json", latencyMs: 1 }), now },
    );
    const incompatible = await observeSymphony(
      { enabled: true, port: 4000 },
      {
        reader: reader({
          statusCode: 200,
          body: state({ running: undefined, blocked: undefined }),
          latencyMs: 1,
        }),
        now,
      },
    );
    expect(notFound.availability).toBe("unavailable");
    expect(malformed.availability).toBe("incompatible");
    expect(incompatible.availability).toBe("incompatible");
  });

  it("maps connection failures and server errors to an unavailable optional runner", async () => {
    const now = () => new Date("2026-08-30T12:00:00.000Z");
    const refused = await observeSymphony(
      { enabled: true, port: 4000 },
      {
        reader: { read: async () => Promise.reject(new Error("connect ECONNREFUSED")) },
        now,
      },
    );
    const timeout = await observeSymphony(
      { enabled: true, port: 4000 },
      { reader: { read: async () => Promise.reject(new Error("timed out")) }, now },
    );
    const serverError = await observeSymphony(
      { enabled: true, port: 4000 },
      { reader: reader({ statusCode: 500, body: "", latencyMs: 1 }), now },
    );
    expect(refused.availability).toBe("unavailable");
    expect(timeout.availability).toBe("unavailable");
    expect(serverError.availability).toBe("unavailable");
  });

  it("marks old, invalid, and future snapshots honestly", () => {
    const now = new Date("2026-08-30T12:10:00.000Z");
    expect(snapshotFreshness("2026-08-30T12:04:59.999Z", now)).toBe("stale");
    expect(snapshotFreshness("not-a-date", now)).toBe("unknown");
    expect(snapshotFreshness("2026-08-30T12:10:01.000Z", now)).toBe("unknown");
  });

  it("caps state items and marks malformed GitHub issue URLs as unknown", async () => {
    const running = Array.from({ length: SYMPHONY_MAX_ITEMS + 2 }, (_, index) => ({
      issue_url:
        index === 0 ? "https://example.test/not-github" : "https://github.com/a/b/issues/1",
    }));
    const observation = await observeSymphony(
      { enabled: true, port: 4000 },
      {
        reader: reader({ statusCode: 200, body: state({ running, blocked: [] }), latencyMs: 1 }),
        repository: "a/b",
        now: () => new Date("2026-08-30T12:01:00.000Z"),
      },
    );
    expect(observation.associations).toEqual({
      current: SYMPHONY_MAX_ITEMS - 1,
      other: 0,
      unknown: 1,
      truncated: true,
    });
  });

  it("uses the fixed ProcessProbe argv for Codex App Server capability", async () => {
    const requests: ProbeRequest[] = [];
    const fakeProbe: ProcessProbe = {
      async run(request) {
        requests.push(request);
        return requests.length === 1 ? completed("codex-cli 0.151.0") : completed("help");
      },
    };
    const observation = await observeCodexAppServer(fakeProbe);
    expect(observation).toEqual({ availability: "supported", codexVersion: "codex-cli 0.151.0" });
    expect(requests).toEqual([
      { command: "codex", args: ["--version"], timeoutMs: 3_000, maxBufferBytes: 524_288 },
      {
        command: "codex",
        args: ["app-server", "--help"],
        timeoutMs: 3_000,
        maxBufferBytes: 524_288,
      },
    ]);
  });

  it("uses one GET without credentials or redirects and caps the response", async () => {
    let requests = 0;
    let observedMethod: string | undefined;
    let observedPath: string | undefined;
    let observedAuthorization: string | undefined;
    let observedCookie: string | undefined;
    const server = http.createServer((request, response) => {
      requests += 1;
      observedMethod = request.method;
      observedPath = request.url;
      observedAuthorization = request.headers.authorization;
      observedCookie = request.headers.cookie;
      response.writeHead(302, { location: "http://127.0.0.1:9/redirect" });
      response.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Missing test port.");
      const observation = await observeSymphony(
        { enabled: true, port: address.port },
        { now: () => new Date("2026-08-30T12:00:00.000Z") },
      );
      expect(observation.availability).toBe("unavailable");
      expect(requests).toBe(1);
      expect(observedMethod).toBe("GET");
      expect(observedPath).toBe("/api/v1/state");
      expect(observedAuthorization).toBeUndefined();
      expect(observedCookie).toBeUndefined();
    } finally {
      server.close();
      await once(server, "close");
    }

    const oversized = http.createServer((_request, response) => {
      response.writeHead(200);
      response.end(Buffer.alloc(SYMPHONY_MAX_RESPONSE_BYTES + 1));
    });
    oversized.listen(0, "127.0.0.1");
    await once(oversized, "listening");
    try {
      const address = oversized.address();
      if (address === null || typeof address === "string") throw new Error("Missing test port.");
      await expect(
        createNodeSymphonyStateReader().read(symphonyEndpoint(address.port)),
      ).rejects.toThrow("exceeded 512 KiB");
    } finally {
      oversized.close();
      await once(oversized, "close");
    }
  });

  it("keeps App Server unverified after timeout and returns a complete optional runner report", async () => {
    const timedOut: ProbeResult = {
      outcome: "timeout",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 3_000,
    };
    const report = await observeOptionalRunners(
      { enabled: true, port: 4000 },
      probe([completed("codex-cli 0.151.0"), timedOut]),
      {
        reader: reader({ statusCode: 200, body: state(), latencyMs: 1 }),
        now: () => new Date("2026-08-30T12:02:00.000Z"),
      },
    );
    expect(report.schemaVersion).toBe(1);
    expect(report.fallback).toBe("native-handoff");
    expect(report.codexAppServer.availability).toBe("unverified");
  });
});

import { once } from "node:events";
import * as http from "node:http";
