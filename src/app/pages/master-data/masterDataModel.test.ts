import { describe, expect, it } from "vitest";
import {
  accountTypeLabels,
  buildAccountPayload,
  buildCategoryPayload,
  buildCurrencyPayload,
  buildMerchantPayload,
  buildPersonPayload,
  buildProjectPayload,
  categoryTypeLabels,
  isProtectedFieldDisabled,
  normalizeCode,
  parseRoles
} from "./masterDataModel";

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

  it("builds people payloads with trimmed fields and actor", () => {
    expect(
      buildPersonPayload(
        { name: " Alice ", alias: " ali ", roles: ["finance_entry"], isEnabled: true },
        "person_admin"
      )
    ).toEqual({
      actor: "person_admin",
      name: "Alice",
      alias: "ali",
      roles: ["finance_entry"],
      isEnabled: true
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
      actor: "person_admin",
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

  it("builds project payloads with uppercase code and actor", () => {
    expect(
      buildProjectPayload(
        { code: " p1 ", name: " Project ", ownerPersonId: "", status: "active", note: "" },
        "person_admin"
      )
    ).toEqual({
      actor: "person_admin",
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
      actor: "person_admin",
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
      actor: "person_admin",
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
      actor: "person_admin",
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
