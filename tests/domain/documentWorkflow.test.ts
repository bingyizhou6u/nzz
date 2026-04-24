import { describe, expect, it } from "vitest";
import { assertDocumentTransition, getLockCheckDate, periodFromDate } from "../../src/domain/documentWorkflow";

describe("documentWorkflow", () => {
  it("allows draft to pending when submitting", () => {
    expect(() => assertDocumentTransition("draft", "pending", "submit")).not.toThrow();
  });

  it("allows rejected to pending when submitting", () => {
    expect(() => assertDocumentTransition("rejected", "pending", "submit")).not.toThrow();
  });

  it("allows pending to approved when approving", () => {
    expect(() => assertDocumentTransition("pending", "approved", "approve")).not.toThrow();
  });

  it("allows pending to rejected when rejecting", () => {
    expect(() => assertDocumentTransition("pending", "rejected", "reject")).not.toThrow();
  });

  it("allows rejected to draft when reopening", () => {
    expect(() => assertDocumentTransition("rejected", "draft", "reopen")).not.toThrow();
  });

  it("rejects approval unless a document is pending", () => {
    expect(() => assertDocumentTransition("draft", "approved", "approve")).toThrow(
      "Only pending documents can be approved"
    );
  });

  it("rejects submit unless a document is draft or rejected", () => {
    expect(() => assertDocumentTransition("approved", "pending", "submit")).toThrow(
      "Only draft or rejected documents can be submitted"
    );
  });

  it("uses business_date as the lock-check date for all current document types", () => {
    expect(getLockCheckDate({ documentType: "project_income", businessDate: "2026-04-24" })).toBe("2026-04-24");
    expect(getLockCheckDate({ documentType: "petty_cash_reimbursement", businessDate: "2026-04-23" })).toBe(
      "2026-04-23"
    );
  });

  it("gets the period from a date", () => {
    expect(periodFromDate("2026-04-24")).toBe("2026-04");
  });
});
