import { describe, expect, it } from "vitest";
import { assertCan, capabilitiesForRoles, can } from "../../src/auth/permissions";
import type { AuthenticatedActor } from "../../src/auth/types";

function actor(roles: AuthenticatedActor["roles"]): AuthenticatedActor {
  return { personId: "person_1", name: "Alice", alias: null, email: "alice@example.com", roles };
}

describe("permissions", () => {
  it("grants approval to admin and finance manager", () => {
    expect(can(actor(["admin"]), "documents.approve")).toBe(true);
    expect(can(actor(["finance_manager"]), "documents.approve")).toBe(true);
  });

  it("denies approval to entry, logistics, readonly, and borrower", () => {
    expect(can(actor(["finance_entry"]), "documents.approve")).toBe(false);
    expect(can(actor(["logistics"]), "documents.approve")).toBe(false);
    expect(can(actor(["readonly"]), "documents.approve")).toBe(false);
    expect(can(actor(["borrower"]), "documents.approve")).toBe(false);
  });

  it("keeps borrower from gaining write access by itself", () => {
    expect(capabilitiesForRoles(["borrower"])).toEqual(["session.view"]);
  });

  it("throws 403 with clear message when unauthorized", () => {
    expect(() => assertCan(actor(["readonly"]), "documents.create")).toThrow("权限不足");
  });
});
