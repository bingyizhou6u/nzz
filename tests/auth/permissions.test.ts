import { describe, expect, it } from "vitest";
import { assertCan, capabilities, capabilitiesForRoles, can, type Capability } from "../../src/auth/permissions";
import { AuthError, type AuthenticatedActor, type PersonRole } from "../../src/auth/types";

function actor(roles: AuthenticatedActor["roles"]): AuthenticatedActor {
  return { personId: "person_1", name: "Alice", alias: null, email: "alice@example.com", roles };
}

const expectedCapabilitiesByRole: Record<PersonRole, Capability[]> = {
  admin: [...capabilities],
  finance_manager: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "documents.approve",
    "documents.reject",
    "documents.previewApproval",
    "masterData.view",
    "masterData.write",
    "reports.view",
    "periodLocks.view",
    "periodLocks.lock"
  ],
  finance_entry: ["session.view", "documents.view", "documents.create", "documents.submit", "masterData.view", "reports.view"],
  logistics: ["session.view", "documents.view", "documents.create", "documents.submit", "reports.view"],
  readonly: ["session.view", "documents.view", "masterData.view", "reports.view"],
  borrower: ["session.view"]
};

describe("permissions", () => {
  it("defines exact capabilities for every role", () => {
    for (const [role, expectedCapabilities] of Object.entries(expectedCapabilitiesByRole) as [PersonRole, Capability[]][]) {
      expect(capabilitiesForRoles([role])).toEqual(expectedCapabilities);
    }
  });

  it("grants admin exactly the exported capabilities", () => {
    expect(capabilitiesForRoles(["admin"])).toEqual(capabilities);
  });

  it("merges multiple roles with stable ordering and no duplicates", () => {
    expect(capabilitiesForRoles(["finance_entry", "finance_manager", "finance_entry"])).toEqual([
      "session.view",
      "documents.view",
      "documents.create",
      "documents.submit",
      "masterData.view",
      "reports.view",
      "documents.approve",
      "documents.reject",
      "documents.previewApproval",
      "masterData.write",
      "periodLocks.view",
      "periodLocks.lock"
    ]);
  });

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
    let thrown: unknown;
    try {
      assertCan(actor(["readonly"]), "documents.create");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AuthError);
    expect(thrown).toMatchObject({ message: "权限不足", status: 403 });
  });
});
