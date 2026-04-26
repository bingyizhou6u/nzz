import { describe, expect, it } from "vitest";
import { canUse, roleLabels, visibleNavigationItems } from "./sessionModel";
import type { SessionState } from "./sessionTypes";

const authenticatedSession: SessionState = {
  status: "authenticated",
  person: {
    id: "person_finance",
    name: "Finance Manager",
    alias: "fm",
    loginEmail: "finance@example.com",
    roles: ["finance_manager"]
  },
  capabilities: ["session.view", "documents.view", "documents.approve", "reports.view"]
};

describe("session model", () => {
  it("checks capabilities only for authenticated sessions", () => {
    expect(canUse(authenticatedSession, "documents.approve")).toBe(true);
    expect(canUse(authenticatedSession, "masterData.view")).toBe(false);
    expect(canUse({ status: "loading" }, "documents.approve")).toBe(false);
    expect(canUse({ status: "error", message: "未绑定" }, "documents.approve")).toBe(false);
  });

  it("shows review navigation only when approval capability is present", () => {
    expect(visibleNavigationItems(authenticatedSession).map((item) => item.key)).toEqual([
      "workspace",
      "documents",
      "review",
      "reports"
    ]);

    expect(
      visibleNavigationItems({
        ...authenticatedSession,
        capabilities: ["session.view", "documents.view", "reports.view"]
      }).map((item) => item.key)
    ).toEqual(["workspace", "documents", "reports"]);
  });

  it("shows month close navigation for period lock viewers", () => {
    expect(
      visibleNavigationItems({
        ...authenticatedSession,
        capabilities: ["session.view", "periodLocks.view"]
      }).map((item) => [item.key, item.label])
    ).toEqual([
      ["workspace", "工作台"],
      ["month-close", "对账月结"]
    ]);
  });

  it("shows workspace first only for authenticated sessions with session visibility", () => {
    expect(
      visibleNavigationItems({
        ...authenticatedSession,
        capabilities: ["session.view", "documents.view"]
      }).map((item) => item.key)
    ).toEqual(["workspace", "documents"]);

    expect(
      visibleNavigationItems({
        ...authenticatedSession,
        capabilities: ["documents.view"]
      }).map((item) => item.key)
    ).toEqual(["documents"]);
    expect(visibleNavigationItems({ status: "loading" })).toEqual([]);
    expect(visibleNavigationItems({ status: "error", message: "未绑定" })).toEqual([]);
  });

  it("uses Chinese role labels for finance managers", () => {
    expect(roleLabels.finance_manager).toBe("财务主管");
  });
});
