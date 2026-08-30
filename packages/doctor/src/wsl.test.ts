import { describe, expect, it } from "vitest";
import { parseWslDistributions, toWslPath } from "./wsl.js";

describe("parseWslDistributions", () => {
  it("handles the NUL-padded output produced by wsl.exe", () => {
    const padded = [..."Ubuntu-24.04\r\n"].join("\0");
    expect(parseWslDistributions(padded)).toEqual(["Ubuntu-24.04"]);
  });
});

describe("toWslPath", () => {
  it("maps Windows drive and WSL UNC paths without reading the filesystem", () => {
    expect(toWslPath("C:\\Projects\\taskchord")).toBe("/mnt/c/Projects/taskchord");
    expect(toWslPath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\oguzhan\\repo")).toBe(
      "/home/oguzhan/repo",
    );
    expect(toWslPath("relative\\path")).toBeUndefined();
  });
});
