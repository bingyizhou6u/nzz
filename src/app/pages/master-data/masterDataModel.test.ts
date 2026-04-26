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
  isDemoRecord,
  isProtectedFieldDisabled,
  masterDataReadiness,
  normalizeCode,
  personFormWithPermittedIdentity,
  personFormWithPermittedRoles,
  personLoginStatus,
  parseRoles
} from "./masterDataModel";
import { MasterDataPage } from "../MasterDataPage";
import { AccountsTab } from "./AccountsTab";
import { MerchantsTab } from "./MerchantsTab";
import { PeopleTab } from "./PeopleTab";
import { ProjectsTab } from "./ProjectsTab";
import type { AccountRow, CurrencyRow, MasterDataSnapshot, MerchantRow, PersonRow, ProjectRow } from "./masterDataTypes";

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

  it("links master data tabs to the active detail panel", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(
      new Response(JSON.stringify({ data: masterDataSnapshot() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(MasterDataPage, {
          capabilities: ["masterData.view", "masterData.write", "masterData.managePeopleRoles"]
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const governanceLayout = container.querySelector(".master-data-governance-layout");
    expect(governanceLayout).toBeInstanceOf(HTMLElement);
    expect(governanceLayout?.textContent).toContain("人员");

    const sideNav = container.querySelector('[role="tablist"][aria-label="基础资料分类"]');
    expect(sideNav).toBeInstanceOf(HTMLElement);
    expect(sideNav?.textContent).toContain("管理科目");

    const peopleTab = tabByText(container, "人员");
    const projectsTab = tabByText(container, "项目");
    expect(peopleTab.id).toBe("master-data-tab-people");
    expect(peopleTab.getAttribute("aria-controls")).toBe("master-data-panel-people");
    expect(projectsTab.id).toBe("master-data-tab-projects");
    expect(projectsTab.getAttribute("aria-controls")).toBe("master-data-panel-projects");

    const panel = container.querySelector(".master-data-detail-region");
    expect(panel).toBeInstanceOf(HTMLElement);
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.id).toBe("master-data-panel-people");
    expect(panel?.getAttribute("aria-labelledby")).toBe("master-data-tab-people");
  });

  it("shows demo and real initialization readiness in the overview", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...masterDataSnapshot(),
            people: [personRow({ id: "demo_person_finance" }), personRow({ id: "person_real_finance" })],
            projects: [projectRow({ id: "demo_project_alpha", code: "P-DEMO-001" })],
            merchants: [],
            accounts: [],
            currencies: [],
            categories: []
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(MasterDataPage, {
          capabilities: ["masterData.view", "masterData.write", "masterData.managePeopleRoles"]
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("真实资料");
    expect(container.textContent).toContain("演示资料");
    expect(container.textContent).toContain("初始化进度");
    expect(container.textContent).toContain("缺少项目、商户、账户、币种、科目");
    expect(container.textContent).toContain("真实资料必须新建");
  });

  it("switches master data tabs with keyboard navigation", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(
      new Response(JSON.stringify({ data: masterDataSnapshot() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        createElement(MasterDataPage, {
          capabilities: ["masterData.view", "masterData.write", "masterData.managePeopleRoles"]
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const peopleTab = tabByText(container, "人员");
    peopleTab.focus();

    await act(async () => {
      peopleTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    const projectsTab = tabByText(container, "项目");
    expect(document.activeElement).toBe(projectsTab);
    expect(projectsTab.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".master-data-detail-region")?.id).toBe("master-data-panel-projects");
  });

  it("groups person login identity fields in a dedicated identity section", async () => {
    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

    const identitySection = container.querySelector(".person-identity-section");
    expect(identitySection).toBeInstanceOf(HTMLFieldSetElement);
    expect(identitySection?.textContent).toContain("登录身份");
    expect(identitySection?.textContent).toContain("登录邮箱");
    expect(identitySection?.textContent).toContain("状态");
    expect(identitySection?.textContent).toContain("管理员");

    const roleGroup = identitySection?.querySelector(".person-role-options");
    expect(roleGroup).toBeInstanceOf(HTMLFieldSetElement);
    expect(roleGroup?.querySelector("legend")?.textContent).toBe("角色");
    expect(checkboxByLabel(container, "管理员").closest("fieldset")).toBe(roleGroup);
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

  it("disables person status controls without manage people roles capability", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: false });

    const statusAction = buttonByText(container, "停用");
    expect(statusAction.disabled).toBe(true);

    await act(async () => {
      statusAction.click();
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      buttonByText(container, "编辑").click();
    });

    const status = selectByLabel(container, "状态");
    expect(status.disabled).toBe(true);
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

  it("marks demo people and highlights login identity state", async () => {
    const container = await renderPeopleTab({
      canWrite: true,
      canManagePeopleRoles: true,
      rows: [personRow({ id: "demo_person_finance", login_email: null, roles_json: "[\"finance_manager\"]" })]
    });

    expect(container.textContent).toContain("演示");
    expect(container.textContent).toContain("未绑定邮箱，不可登录");
    expect(container.textContent).toContain("财务主管");
  });

  it("marks demo projects merchants and accounts in lists", async () => {
    const projectContainer = await renderProjectsTab([projectRow({ id: "demo_project_alpha", code: "P-DEMO-001" })]);
    expect(projectContainer.textContent).toContain("演示");

    const merchantContainer = await renderMerchantsTab([
      merchantRow({ id: "demo_merchant_alpha", code: "M-DEMO-001", project_id: "demo_project_alpha" })
    ]);
    expect(merchantContainer.textContent).toContain("演示");

    const accountContainer = await renderAccountsTab([accountRow({ id: "demo_acct_usdt_main", name: "演示 USDT 主钱包" })]);
    expect(accountContainer.textContent).toContain("演示");
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

  it("allows person status changes with manage people roles capability", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

    await act(async () => {
      buttonByText(container, "编辑").click();
    });

    const status = selectByLabel(container, "状态");
    expect(status.disabled).toBe(false);

    await act(async () => {
      setSelectValue(status, "disabled");
    });

    await act(async () => {
      buttonByText(container, "保存人员").click();
      await Promise.resolve();
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      isEnabled: false
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

  it("preserves existing person roles, login email, and status without role management permission", () => {
    expect(
      personFormWithPermittedIdentity(
        { name: "Alice", alias: "", roles: ["finance_entry"], loginEmail: "changed@example.com", isEnabled: true },
        { roles: ["admin"], loginEmail: "admin@example.com", isEnabled: false },
        false
      )
    ).toEqual({
      name: "Alice",
      alias: "",
      roles: ["admin"],
      loginEmail: "admin@example.com",
      isEnabled: false
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

  it("identifies demo records from seeded ids and codes", () => {
    expect(isDemoRecord({ id: "demo_person_finance", name: "演示财务主管" })).toBe(true);
    expect(isDemoRecord({ id: "project_1", code: "P-DEMO-001", name: "演示项目 Alpha" })).toBe(true);
    expect(isDemoRecord({ id: "person_real_finance", name: "真实财务主管" })).toBe(false);
  });

  it("summarizes demo and real initialization readiness", () => {
    const readiness = masterDataReadiness({
      ...masterDataSnapshot(),
      people: [personRow({ id: "demo_person_finance" }), personRow({ id: "person_real_finance", login_email: "" })],
      projects: [projectRow({ id: "demo_project_alpha", code: "P-DEMO-001" })],
      merchants: [],
      accounts: [],
      currencies: [],
      categories: []
    });

    expect(readiness.demoTotal).toBe(2);
    expect(readiness.realTotal).toBe(1);
    expect(readiness.groups.find((group) => group.key === "people")).toMatchObject({
      label: "人员",
      demo: 1,
      real: 1,
      ready: true
    });
    expect(readiness.groups.find((group) => group.key === "merchants")).toMatchObject({
      label: "商户",
      demo: 0,
      real: 0,
      ready: false
    });
    expect(readiness.blockers).toContain("商户");
    expect(readiness.ready).toBe(false);
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

function personRow(overrides: Partial<PersonRow> = {}): PersonRow {
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
    referenceCount: 0,
    ...overrides
  };
}

function projectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "project_1",
    code: "P1",
    name: "Project One",
    owner_person_id: "person_1",
    status: "active",
    note: null,
    created_at: "2026-04-25T10:00:00Z",
    referenceCount: 0,
    ...overrides
  };
}

function merchantRow(overrides: Partial<MerchantRow> = {}): MerchantRow {
  return {
    id: "merchant_1",
    code: "M1",
    name: "Merchant One",
    project_id: "project_1",
    merchant_type: "site",
    launch_date: "2026-04-01",
    status: "active",
    owner_person_id: "person_1",
    note: null,
    created_at: "2026-04-25T10:00:00Z",
    referenceCount: 0,
    ...overrides
  };
}

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: "account_1",
    name: "USDT Main",
    account_type: "usdt_wallet",
    currency_code: "USDT",
    owner_person_id: null,
    is_company_account: 1,
    allow_negative: 0,
    status: "active",
    created_at: "2026-04-25T10:00:00Z",
    referenceCount: 0,
    ...overrides
  };
}

function currencyRow(overrides: Partial<CurrencyRow> = {}): CurrencyRow {
  return {
    code: "USDT",
    name: "Tether",
    minor_units: 2,
    is_enabled: 1,
    referenceCount: 0,
    ...overrides
  };
}

function masterDataSnapshot(): MasterDataSnapshot {
  return {
    people: [personRow()],
    projects: [projectRow()],
    merchants: [],
    accounts: [],
    currencies: [],
    categories: []
  };
}

async function renderPeopleTab({
  canWrite,
  canManagePeopleRoles,
  rows = [personRow()]
}: {
  canWrite: boolean;
  canManagePeopleRoles: boolean;
  rows?: PersonRow[];
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(PeopleTab, {
        rows,
        canWrite,
        canManagePeopleRoles,
        onChanged: () => undefined
      })
    );
  });

  return container;
}

async function renderProjectsTab(rows: ProjectRow[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(ProjectsTab, {
        rows,
        people: [personRow({ id: "demo_person_finance" })],
        canWrite: true,
        onChanged: () => undefined
      })
    );
  });

  return container;
}

async function renderMerchantsTab(rows: MerchantRow[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(MerchantsTab, {
        rows,
        people: [personRow({ id: "demo_person_finance" })],
        projects: [projectRow({ id: "demo_project_alpha", code: "P-DEMO-001" })],
        canWrite: true,
        onChanged: () => undefined
      })
    );
  });

  return container;
}

async function renderAccountsTab(rows: AccountRow[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(AccountsTab, {
        rows,
        people: [personRow()],
        currencies: [currencyRow()],
        canWrite: true,
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

function tabByText(container: HTMLElement, text: string): HTMLButtonElement {
  const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!(tab instanceof HTMLButtonElement)) {
    throw new Error(`Tab not found: ${text}`);
  }

  return tab;
}

function inputByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const input = controlByLabel(container, text, HTMLInputElement);
  if (input.type === "checkbox") {
    throw new Error(`Text input not found: ${text}`);
  }
  return input;
}

function selectByLabel(container: HTMLElement, text: string): HTMLSelectElement {
  return controlByLabel(container, text, HTMLSelectElement);
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

function setSelectValue(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  valueSetter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
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
