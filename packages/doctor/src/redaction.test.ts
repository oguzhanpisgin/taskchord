import { describe, expect, it } from "vitest";
import { redactText, summarizeOutput } from "./redaction.js";

describe("redactText", () => {
  it.each([
    ["C:\\Users\\Alice\\repo", "~\\repo"],
    ["/home/alice/repo", "~/repo"],
    ["/Users/alice/repo", "~/repo"],
    ["ghp_1234567890abcdefghijkl", "[redacted]"],
    ["github_pat_1234567890_abcdefghijklmnop", "[redacted]"],
    ["sk-abcdefghijklmnop", "[redacted]"],
    ["token=secret-value", "token=[redacted]"],
  ])("redacts %s", (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it("is idempotent", () => {
    const once = redactText("token=ghp_1234567890abcdefghijkl at C:\\Users\\Alice\\repo");
    expect(redactText(once)).toBe(once);
  });
});

describe("summarizeOutput", () => {
  it("uses only the first non-empty line and caps its length", () => {
    expect(summarizeOutput("\n first line \nsecret second line")).toBe("first line");
    expect(summarizeOutput("x".repeat(250))).toHaveLength(200);
  });
});
