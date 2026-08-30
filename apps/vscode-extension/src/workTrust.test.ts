import { describe, expect, it } from "vitest";
import { canUseWork } from "./workTrust.js";

describe("Work workspace trust gate", () => {
  it("allows trusted workspaces and rejects untrusted workspaces", () => {
    expect(canUseWork(true)).toBe(true);
    expect(canUseWork(false)).toBe(false);
  });
});
