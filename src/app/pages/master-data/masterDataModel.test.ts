// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountTypeLabels,
  buildAccountPayload,
  buildCategoryPayload,
  buildCurrencyPayload,
  buildMerchantPayload,
  buildPersonPayload,
  buildProjectPayload,
  canManagePeopleRoleAssignments,
  canWriteMasterData,
  categoryTypeLabels,
  isProtectedFieldDisabled,
  normalizeCode,
  personFormWithPermittedIdentity,
  personFormWithPermittedRoles,
  personLoginStatus,
  parseRoles
} from "./masterDataModel";
import { PeopleTab } from "./PeopleTab";
import { ProjectsTab } from "./ProjectsTab";
import type { PersonRow, ProjectRow } from "./masterDataTypes";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }

  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("master data capability gating", () => {
  it("derives write and people role management permissions from capabilities", () => {
    expect(canWriteMasterData(["masterData.view", "masterData.write"])).toBe(true);
    expect(canWriteMasterData(["masterData.view"])).toBe(false);
    expect(canManagePeopleRoleAssignments(["masterData.managePeopleRoles"])).toBe(true);
    expect(canManagePeopleRoleAssignments(["masterData.write"])).toBe(false);
  });

  it("preserves existing person roles when role management is not allowed", () => {
    expect(
      personFormWithPermittedRoles(
        { name: "Alice", alias: "", roles: ["finance_entry"], loginEmail: "", isEnabled: true },
        ["admin"],
        false
      ).roles
    ).toEqual(["admin"]);
    expect(
      personFormWithPermittedRoles(
        { name: "Alice", alias: "", roles: ["finance_entry"], loginEmail: "", isEnabled: true },
        ["admin"],
        true
      ).roles
    ).toEqual(["finance_entry"]);
  });

  it("renders read-only tabs without write forms or status actions when master data write is missing", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(ProjectsTab, {
          rows: [projectRow()],
          people: [personRow()],
          canWrite: false,
          onChanged: () => undefined
        })
      );
    });

    expect(container.textContent).toContain("只读");
    expect(buttonTexts(container)).not.toContain("创建项目");
    expect(buttonTexts(container)).not.toContain("编辑");
    expect(buttonTexts(container)).not.toContain("归档");
  });

  it("disables person role controls and preserves existing roles without manage people roles capability", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: false });

    await act(async () => {
      buttonByText(container, "编辑").click();
    });

    const financeEntryRole = checkboxByLabel(container, "财务录入");
    expect(financeEntryRole.disabled).toBe(true);

    await act(async () => {
      financeEntryRole.click();
      const nameInput = inputByLabel(container, "姓名");
      setInputValue(nameInput, "Alice Updated");
    });

    await act(async () => {
      buttonByText(container, "保存人员").click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      name: "Alice Updated",
      roles: ["admin"],
      loginEmail: "admin@example.com"
    });
  });

  it("disables login email controls without manage people roles capability", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: false });

    await act(async () => {
      buttonByText(container, "编辑").click();
    });

    const loginEmail = inputByLabel(container, "登录邮箱");
    expect(loginEmail.disabled).toBe(true);

    await act(async () => {
      setInputValue(loginEmail, "changed@example.com");
      setInputValue(inputByLabel(container, "姓名"), "Alice Updated");
    });

    await act(async () => {
      buttonByText(container, "保存人员").click();
      await Promise.resolve();
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      name: "Alice Updated",
      roles: ["admin"],
      loginEmail: "admin@example.com"
    });
  });

  it("allows login email edits with manage people roles capability", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

    await act(async () => {
      buttonByText(container, "编辑").click();
    });

    const loginEmail = inputByLabel(container, "登录邮箱");
    expect(loginEmail.disabled).toBe(false);

    await act(async () => {
      setInputValue(loginEmail, "  Changed@Example.COM  ");
    });

    await act(async () => {
      buttonByText(container, "保存人员").click();
      await Promise.resolve();
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      loginEmail: "changed@example.com"
    });
  });

  it("renders login email status and last login columns", async () => {
    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

    expect(container.textContent).toContain("admin@example.com");
    expect(container.textContent).toContain("可登录");
    expect(container.textContent).toContain("2026-04-25T10:30:00Z");
  });

  it("allows person role changes with manage people roles capability", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

    await act(async () => {
      buttonByText(container, "编辑").click();
    });

    const financeEntryRole = checkboxByLabel(container, "财务录入");
    expect(financeEntryRole.disabled).toBe(false);

    await act(async () => {
      financeEntryRole.click();
    });

    await act(async () => {
      buttonByText(container, "保存人员").click();
      await Promise.resolve();
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      roles: ["admin", "finance_entry"]
    });
  });
});

describe("master data model", () => {
  it("normalizes business codes to uppercase", () => {
    expect(normalizeCode(" p-demo-001 ")).toBe("P-DEMO-001");
    expect(normalizeCode(" aed ")).toBe("AED");
  });

  it("parses roles_json defensively", () => {
    expect(parseRoles("[\"finance_entry\",\"logistics\"]")).toEqual(["finance_entry", "logistics"]);
    expect(parseRoles("not json")).toEqual([]);
    expect(parseRoles("[1,\"admin\"]")).toEqual(["admin"]);
  });

  it("builds people payloads with trimmed fields", () => {
    expect(
      buildPersonPayload(
        { name: " Alice ", alias: " ali ", roles: ["finance_entry"], loginEmail: "", isEnabled: true },
        "person_admin"
      )
    ).toEqual({
      name: "Alice",
      alias: "ali",
      roles: ["finance_entry"],
      loginEmail: null,
      isEnabled: true
    });
  });

  it("builds people payloads with normalized login email", () => {
    expect(
      buildPersonPayload({
        name: " Alice ",
        alias: " ali ",
        roles: ["admin"],
        loginEmail: "  Alice@Example.COM  ",
        isEnabled: true
      })
    ).toEqual({
      name: "Alice",
      alias: "ali",
      roles: ["admin"],
      loginEmail: "alice@example.com",
      isEnabled: true
    });
  });

  it("preserves existing person roles and login email without role management permission", () => {
    expect(
      personFormWithPermittedIdentity(
        { name: "Alice", alias: "", roles: ["finance_entry"], loginEmail: "changed@example.com", isEnabled: true },
        { roles: ["admin"], loginEmail: "admin@example.com" },
        false
      )
    ).toEqual({
      name: "Alice",
      alias: "",
      roles: ["admin"],
      loginEmail: "admin@example.com",
      isEnabled: true
    });
  });

  it("derives person login statuses", () => {
    expect(personLoginStatus({ is_enabled: 1, login_email: "admin@example.com" })).toEqual({
      label: "可登录",
      tone: "ok"
    });
    expect(personLoginStatus({ is_enabled: 1, login_email: null })).toEqual({
      label: "未绑定邮箱，不可登录",
      tone: "warning"
    });
    expect(personLoginStatus({ is_enabled: 0, login_email: "old@example.com" })).toEqual({
      label: "已停用，不可登录",
      tone: "muted"
    });
  });

  it("builds petty cash account payloads with person ownership and negative balance enabled", () => {
    expect(
      buildAccountPayload(
        {
          name: " Bob AED Petty ",
          accountType: "petty_cash",
          currencyCode: "aed",
          ownerPersonId: "person_bob",
          isCompanyAccount: false,
          allowNegative: true,
          status: "active"
        },
        "person_admin"
      )
    ).toEqual({
      name: "Bob AED Petty",
      accountType: "petty_cash",
      currencyCode: "AED",
      ownerPersonId: "person_bob",
      isCompanyAccount: false,
      allowNegative: true,
      status: "active"
    });
  });

  it("marks protected fields disabled when rows are referenced", () => {
    expect(isProtectedFieldDisabled({ referenceCount: 2 }, "currencyCode")).toBe(true);
    expect(isProtectedFieldDisabled({ referenceCount: 0 }, "currencyCode")).toBe(false);
    expect(isProtectedFieldDisabled({ referenceCount: 2 }, "name")).toBe(false);
  });

  it("provides labels for current account and category types", () => {
    expect(accountTypeLabels.petty_cash).toBe("人员备用金账户");
    expect(categoryTypeLabels.loss).toBe("损失");
  });

  it("builds project payloads with uppercase code", () => {
    expect(
      buildProjectPayload(
        { code: " p1 ", name: " Project ", ownerPersonId: "", status: "active", note: "" },
        "person_admin"
      )
    ).toEqual({
      code: "P1",
      name: "Project",
      ownerPersonId: null,
      status: "active",
      note: null
    });
  });

  it("builds merchant payloads with project linkage", () => {
    expect(
      buildMerchantPayload(
        {
          code: " m1 ",
          name: " Merchant ",
          projectId: "proj_1",
          merchantType: "site",
          launchDate: "",
          status: "active",
          ownerPersonId: "",
          note: ""
        },
        "person_admin"
      )
    ).toEqual({
      code: "M1",
      name: "Merchant",
      projectId: "proj_1",
      merchantType: "site",
      launchDate: null,
      status: "active",
      ownerPersonId: null,
      note: null
    });
  });

  it("builds currency and category payloads", () => {
    expect(buildCurrencyPayload({ code: " aed ", name: "Dirham", minorUnits: "2", isEnabled: true }, "person_admin")).toEqual({
      code: "AED",
      name: "Dirham",
      minorUnits: 2,
      isEnabled: true
    });
    expect(
      buildCategoryPayload(
        {
          name: "Travel",
          parentId: "",
          categoryType: "expense",
          direction: "out",
          affectsExpenseReport: true,
          affectsProjectReport: false,
          requiresMerchant: false,
          requiresPerson: true,
          requiresBorrower: false,
          isEnabled: true
        },
        "person_admin"
      )
    ).toMatchObject({
      name: "Travel",
      parentId: null,
      categoryType: "expense",
      direction: "out"
    });
  });
});

describe("master data component modules", () => {
  it("exports shared table and form components", async () => {
    const table = await import("./MasterDataTable");
    const form = await import("./MasterDataForm");
    const overview = await import("./MasterDataOverview");

    expect(table.MasterDataTable).toBeTypeOf("function");
    expect(form.FormActions).toBeTypeOf("function");
    expect(overview.MasterDataOverview).toBeTypeOf("function");
  });
});

describe("master data first tab modules", () => {
  it("exports people project and merchant tabs", async () => {
    const people = await import("./PeopleTab");
    const projects = await import("./ProjectsTab");
    const merchants = await import("./MerchantsTab");

    expect(people.PeopleTab).toBeTypeOf("function");
    expect(projects.ProjectsTab).toBeTypeOf("function");
    expect(merchants.MerchantsTab).toBeTypeOf("function");
  });
});

describe("master data accounting tab modules", () => {
  it("exports account currency and category tabs", async () => {
    const accounts = await import("./AccountsTab");
    const currencies = await import("./CurrenciesTab");
    const categories = await import("./CategoriesTab");

    expect(accounts.AccountsTab).toBeTypeOf("function");
    expect(currencies.CurrenciesTab).toBeTypeOf("function");
    expect(categories.CategoriesTab).toBeTypeOf("function");
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function personRow(): PersonRow {
  return {
    id: "person_1",
    name: "Alice",
    alias: "ali",
    roles_json: "[\"admin\"]",
    is_enabled: 1,
    login_email: "admin@example.com",
    access_subject: null,
    last_login_at: "2026-04-25T10:30:00Z",
    created_at: "2026-04-25T10:00:00Z",
    referenceCount: 0
  };
}

function projectRow(): ProjectRow {
  return {
    id: "project_1",
    code: "P1",
    name: "Project One",
    owner_person_id: "person_1",
    status: "active",
    note: null,
    created_at: "2026-04-25T10:00:00Z",
    referenceCount: 0
  };
}

async function renderPeopleTab({
  canWrite,
  canManagePeopleRoles
}: {
  canWrite: boolean;
  canManagePeopleRoles: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(PeopleTab, {
        rows: [personRow()],
        canWrite,
        canManagePeopleRoles,
        onChanged: () => undefined
      })
    );
  });

  return container;
}

function buttonTexts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function inputByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const input = controlByLabel(container, text, HTMLInputElement);
  if (input.type === "checkbox") {
    throw new Error(`Text input not found: ${text}`);
  }
  return input;
}

function checkboxByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const input = controlByLabel(container, text, HTMLInputElement);
  if (input.type !== "checkbox") {
    throw new Error(`Checkbox not found: ${text}`);
  }
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function controlByLabel<T extends HTMLInputElement | HTMLSelectElement>(
  container: HTMLElement,
  text: string,
  constructor: { new (): T }
): T {
  const label = Array.from(container.querySelectorAll("label")).find((candidate) =>
    candidate.textContent?.includes(text)
  );
  const control = label?.querySelector("input, select");

  if (!(control instanceof constructor)) {
    throw new Error(`Control not found: ${text}`);
  }

  return control;
}
