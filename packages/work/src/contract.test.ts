import { describe, expect, it } from "vitest";
import {
  newContractTemplate,
  parseContractDocument,
  parseIssueBody,
  renderContractDocument,
  renderIssueBody,
} from "./contract.js";

const id = "123e4567-e89b-12d3-a456-426614174000";

describe("Issue Contract markdown", () => {
  it("parses and canonically renders every contract field", () => {
    const parsed = parseIssueBody(
      `before\n\n<!-- taskchord:contract v=1 id=${id} -->\n\n## outcome\nShip it\n\n## Boundaries\nNo extras\n\n## Acceptance\n- [ ] Works\n\n## Verification\npnpm validate\n\n## Goal\nStay focused\n\n<!-- /taskchord:contract -->\n\nafter`,
    );
    expect(parsed.kind).toBe("contract");
    if (parsed.kind !== "contract") {
      return;
    }
    expect(parsed.contract).toMatchObject({
      id,
      outcome: "Ship it",
      boundaries: "No extras",
      acceptance: "- [ ] Works",
      verification: "pnpm validate",
      goal: "Stay focused",
      prefix: "before\n",
      suffix: "\nafter",
    });
    const roundTrip = parseIssueBody(renderIssueBody(parsed.contract));
    expect(roundTrip.kind).toBe("contract");
    if (roundTrip.kind === "contract") {
      expect(roundTrip.contract).toEqual(parsed.contract);
    }
  });

  it("ignores known headings inside backtick and tilde fences", () => {
    const body = `<!-- taskchord:contract v=1 id=${id} -->\n## Outcome\n\`\`\`md\n## Goal\nnot a goal\n\`\`\`\n~~~md\n## Verification\nnot verification\n~~~\n## Boundaries\nOnly this\n## Acceptance\nAccepted\n## Verification\nTested\n## Goal\nReal goal\n<!-- /taskchord:contract -->`;
    const parsed = parseIssueBody(body);
    expect(parsed.kind).toBe("contract");
    if (parsed.kind === "contract") {
      expect(parsed.contract.outcome).toContain("## Goal");
      expect(parsed.contract.outcome).toContain("## Verification");
      expect(parsed.contract.goal).toBe("Real goal");
    }
  });

  it("classifies ordinary and newer schema bodies without rewriting them", () => {
    expect(parseIssueBody("ordinary issue")).toEqual({ kind: "unstructured" });
    expect(parseIssueBody(`<!-- taskchord:contract v=2 id=${id} -->`)).toEqual({
      kind: "contract-newer",
      version: 2,
    });
  });

  it("normalizes CRLF and restores a missing closing marker", () => {
    const parsed = parseIssueBody(`<!-- taskchord:contract v=1 id=${id} -->\r\n## Outcome\r\nDone`);
    expect(parsed.kind).toBe("contract");
    if (parsed.kind === "contract") {
      expect(renderIssueBody(parsed.contract)).toContain("<!-- /taskchord:contract -->");
    }
  });

  it("round-trips the editor title separately from the body", () => {
    const body = newContractTemplate(id);
    const document = renderContractDocument("My title", body);
    const parsed = parseContractDocument(document);
    expect(parsed.title).toBe("My title");
    expect(parsed.body).toBe(body);
    expect(parsed.parsedBody.kind).toBe("contract");
  });
});
