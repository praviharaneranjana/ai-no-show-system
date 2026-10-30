import { describe, expect, it } from "vitest";

import { decodeToken, hasRole, isExpired } from "@/lib/session-token";

function makeToken(payload: object, signature = "sig") {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${b64}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);

describe("decodeToken", () => {
  it("decodes a well-formed token payload", () => {
    const token = makeToken({ sub: "u1", email: "a@b.c", name: "A", role: "manager", iat: now, exp: now + 60 });
    expect(decodeToken(token)).toMatchObject({ email: "a@b.c", role: "manager" });
  });

  it("rejects missing, malformed and unknown-role tokens", () => {
    expect(decodeToken(undefined)).toBeNull();
    expect(decodeToken("")).toBeNull();
    expect(decodeToken("not-a-token")).toBeNull();
    expect(decodeToken("a.b.c")).toBeNull();
    expect(decodeToken("!!!.sig")).toBeNull();
    expect(decodeToken(makeToken({ role: "superuser", exp: now + 60 }))).toBeNull();
    expect(decodeToken(makeToken({ role: "admin" }))).toBeNull(); // no exp
  });

  it("round-trips non-ASCII names", () => {
    const token = makeToken({ sub: "u", email: "e", name: "නිමල් පෙරේරා", role: "admin", iat: now, exp: now + 60 });
    expect(decodeToken(token)?.name).toBe("නිමල් පෙරේරා");
  });
});

describe("isExpired / hasRole", () => {
  it("detects expiry", () => {
    const base = { sub: "u", email: "e", name: "n", role: "admin" as const, iat: now };
    expect(isExpired({ ...base, exp: now - 1 })).toBe(true);
    expect(isExpired({ ...base, exp: now + 60 })).toBe(false);
  });

  it("orders roles front_desk < manager < admin", () => {
    expect(hasRole("front_desk", "manager")).toBe(false);
    expect(hasRole("manager", "manager")).toBe(true);
    expect(hasRole("admin", "manager")).toBe(true);
    expect(hasRole("manager", "admin")).toBe(false);
    expect(hasRole(undefined, "front_desk")).toBe(false);
  });
});
