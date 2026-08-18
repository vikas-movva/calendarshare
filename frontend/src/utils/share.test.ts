import { describe, it, expect } from "vitest";
import { visibilityLabel, isExpired, isRevoked } from "../utils/share";

describe("share utils", () => {
  it("maps visibility to labels", () => {
    expect(visibilityLabel("busy")).toBe("Busy / Free");
    expect(visibilityLabel("title_time")).toBe("Title + Time");
    expect(visibilityLabel("details")).toBe("Details");
  });

  it("detects expired shares", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isExpired({ expires_at: past } as any)).toBe(true);
    expect(isExpired({ expires_at: null } as any)).toBe(false);
  });

  it("detects revoked shares", () => {
    expect(isRevoked({ revoked_at: new Date().toISOString() } as any)).toBe(true);
    expect(isRevoked({ revoked_at: null } as any)).toBe(false);
  });
});