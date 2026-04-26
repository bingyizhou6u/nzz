import { describe, expect, it } from "vitest";
import {
  accountBalanceChecks,
  canLockFromCheckResults,
  documentWorkflowChecks,
  loanAgingChecks,
  pendingCostChecks,
  projectIntegrityChecks,
  summarizeCheckResults,
  type MonthCloseCheckOptions
} from "../../src/services/monthCloseChecks";

const options: MonthCloseCheckOptions = {
  staleDays: 7,
  stalePendingCostDays: 10,
  staleLoanDays: 30,
  pettyCashNegativeCriticalDays: 14,
  pettyCashNegativeCriticalAmountMinor: 100000
};

describe("month close check rules", () => {
  it("flags pending, draft, and rejected documents with close severities", () => {
    const checks = documentWorkflowChecks(
      [
        {
          id: "doc_pending",
          status: "pending",
          period: "2026-04",
          businessDate: "2026-04-26",
          createdAt: "2026-04-26T00:00:00.000Z",
          submittedAt: "2026-04-27T00:00:00.000Z"
        },
        {
          id: "doc_draft",
          status: "draft",
          period: "2026-04",
          businessDate: "2026-04-20",
          createdAt: "2026-04-20T00:00:00.000Z",
          submittedAt: null
        },
        {
          id: "doc_rejected",
          status: "rejected",
          period: "2026-04",
          businessDate: "2026-04-18",
          createdAt: "2026-04-18T00:00:00.000Z",
          submittedAt: "2026-04-18T12:00:00.000Z"
        }
      ],
      options
    );

    expect(checks.map((check) => [check.checkType, check.severity, check.entityId])).toEqual([
      ["pending_document", "critical", "doc_pending"],
      ["draft_document", "info", "doc_draft"],
      ["rejected_document", "warning", "doc_rejected"]
    ]);
    expect(checks[0]).toMatchObject({
      entityType: "document",
      businessDate: "2026-04-26",
      suggestedAction: "审核或退回该单据后再继续月结"
    });
  });

  it("flags negative company accounts as critical and petty cash as warning", () => {
    const checks = accountBalanceChecks(
      [
        {
          accountId: "acct_company",
          accountType: "currency_reserve",
          ownerPersonId: null,
          isCompanyAccount: true,
          allowNegative: false,
          currencyCode: "AED",
          balanceMinor: -500
        },
        {
          accountId: "acct_petty",
          accountType: "petty_cash",
          ownerPersonId: "person_ops",
          isCompanyAccount: false,
          allowNegative: true,
          currencyCode: "AED",
          balanceMinor: -300
        },
        {
          accountId: "acct_ok",
          accountType: "currency_reserve",
          ownerPersonId: null,
          isCompanyAccount: true,
          allowNegative: false,
          currencyCode: "USDT",
          balanceMinor: 1000
        }
      ],
      options
    );

    expect(checks.map((check) => [check.checkType, check.severity, check.entityId, check.amountMinor])).toEqual([
      ["negative_company_account", "critical", "acct_company", -500],
      ["negative_petty_cash", "warning", "acct_petty", -300]
    ]);
  });

  it("upgrades stale pending costs to critical", () => {
    const checks = pendingCostChecks(
      [
        {
          id: "pending_recent",
          documentId: "doc_recent",
          personId: "person_ops",
          accountId: "acct_petty",
          currencyCode: "AED",
          remainingAmountMinor: 1200,
          expenseDate: "2026-04-26",
          ageDays: 3
        },
        {
          id: "pending_stale",
          documentId: "doc_stale",
          personId: "person_ops",
          accountId: "acct_petty",
          currencyCode: "AED",
          remainingAmountMinor: 5000,
          expenseDate: "2026-04-10",
          ageDays: 16
        }
      ],
      options
    );

    expect(checks.map((check) => [check.checkType, check.severity, check.entityId])).toEqual([
      ["pending_cost", "warning", "pending_recent"],
      ["stale_pending_cost", "critical", "pending_stale"]
    ]);
  });

  it("flags stale loans as warning", () => {
    const checks = loanAgingChecks(
      [
        {
          loanItemId: "loan_recent",
          borrowerPersonId: "person_borrower",
          currencyCode: "USDT",
          remainingAmountMinor: 1000,
          remainingUsdtCostMinor: 1000,
          loanDate: "2026-04-20",
          ageDays: 10
        },
        {
          loanItemId: "loan_stale",
          borrowerPersonId: "person_borrower",
          currencyCode: "USDT",
          remainingAmountMinor: 7000,
          remainingUsdtCostMinor: 7000,
          loanDate: "2026-03-01",
          ageDays: 60
        }
      ],
      options
    );

    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      checkType: "stale_loan",
      severity: "warning",
      entityType: "loan_item",
      entityId: "loan_stale",
      amountMinor: 7000,
      usdtCostMinor: 7000
    });
  });

  it("flags project income without merchant and merchant-project mismatches as critical", () => {
    const checks = projectIntegrityChecks(
      [
        {
          documentId: "doc_missing_merchant",
          documentType: "project_income",
          businessDate: "2026-04-10",
          projectId: "proj_1",
          merchantId: null,
          merchantProjectId: null
        },
        {
          documentId: "doc_mismatch",
          documentType: "project_income",
          businessDate: "2026-04-11",
          projectId: "proj_1",
          merchantId: "merchant_2",
          merchantProjectId: "proj_2"
        },
        {
          documentId: "doc_ok",
          documentType: "project_income",
          businessDate: "2026-04-12",
          projectId: "proj_1",
          merchantId: "merchant_1",
          merchantProjectId: "proj_1"
        }
      ],
      options
    );

    expect(checks.map((check) => [check.checkType, check.entityId])).toEqual([
      ["project_income_missing_merchant", "doc_missing_merchant"],
      ["merchant_project_mismatch", "doc_mismatch"]
    ]);
    expect(checks.every((check) => check.severity === "critical")).toBe(true);
  });

  it("summarizes severities and decides lock eligibility from handling state", () => {
    const checks = [
      check("critical", "resolved"),
      check("warning", "acknowledged"),
      check("warning", "waived"),
      check("info", "open")
    ];

    expect(summarizeCheckResults(checks)).toEqual({
      criticalCount: 1,
      warningCount: 2,
      infoCount: 1
    });
    expect(canLockFromCheckResults(checks)).toBe(true);
    expect(canLockFromCheckResults([...checks, check("critical", "open")])).toBe(false);
    expect(canLockFromCheckResults([...checks, check("warning", "open")])).toBe(false);
  });
});

function check(
  severity: "critical" | "warning" | "info",
  status: "open" | "assigned" | "acknowledged" | "resolved" | "waived"
) {
  return {
    checkType: `${severity}_${status}`,
    severity,
    entityType: "test",
    entityId: `${severity}_${status}`,
    businessDate: null,
    currencyCode: null,
    amountMinor: null,
    usdtCostMinor: null,
    message: "message",
    suggestedAction: "action",
    status
  };
}
