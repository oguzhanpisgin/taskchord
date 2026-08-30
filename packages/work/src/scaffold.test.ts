import type { IssueContract } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { scaffoldFindings } from "./scaffold.js";

const empty: IssueContract = {
  id: "contract-id",
  outcome: "",
  boundaries: "",
  acceptance: "",
  verification: "",
  goal: "",
  prefix: "",
  suffix: "",
};

describe("Intent Scaffold", () => {
  it("flags required fields and recommends Goal without changing input", () => {
    const before = structuredClone(empty);
    const findings = scaffoldFindings("", empty);
    expect(findings.map((finding) => [finding.field, finding.severity])).toEqual([
      ["title", "required"],
      ["outcome", "required"],
      ["boundaries", "required"],
      ["acceptance", "required"],
      ["verification", "required"],
      ["goal", "recommended"],
    ]);
    expect(empty).toEqual(before);
  });

  it("treats comments and whitespace as empty", () => {
    expect(scaffoldFindings("Title", { ...empty, outcome: " <!-- note --> " })[0]?.field).toBe(
      "outcome",
    );
  });
});
