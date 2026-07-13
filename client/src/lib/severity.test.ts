import { describe, it, expect } from "vitest";
import { sevToken, SEVERITY_TOKEN_FALLBACK } from "./severity";

describe("sevToken", () => {
  it("maps the real severities to their design-system colour tokens", () => {
    expect(sevToken("CRITICAL")).toBe("var(--crit)");
    expect(sevToken("WARNING")).toBe("var(--warn)");
    expect(sevToken("SUGGESTION")).toBe("var(--sugg)");
    expect(sevToken("INFO")).toBe("var(--info)");
  });

  it("falls back for an unknown severity", () => {
    expect(sevToken("BOGUS")).toBe(SEVERITY_TOKEN_FALLBACK);
    expect(sevToken("")).toBe(SEVERITY_TOKEN_FALLBACK);
  });

  // `severity` is wire-supplied. A bare `MAP[severity]` lookup with an
  // Object.prototype key resolves UP the prototype chain and returns a
  // *function* — truthy, so a `??` fallback never fires — which would then be
  // handed to React as a CSSProperties value. The own-property guard must hold.
  it("does not resolve Object.prototype keys up the prototype chain", () => {
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      const token = sevToken(key);
      expect(token).toBe(SEVERITY_TOKEN_FALLBACK);
      expect(typeof token).toBe("string");
    }
  });
});
