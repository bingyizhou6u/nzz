import { describe, expect, it } from "vitest";
import { formatLocalDateInputValue, formatLocalMonthInputValue, isOriginalDocumentRequired } from "./DocumentsPage";

describe("document date defaults", () => {
  it("formats date inputs from local calendar fields", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 0,
      getDate: () => 5
    } as Date;

    expect(formatLocalDateInputValue(date)).toBe("2026-01-05");
  });

  it("formats month inputs from local calendar fields", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 30
    } as Date;

    expect(formatLocalMonthInputValue(date)).toBe("2026-09");
  });

  it("requires original document IDs for correction and reversal drafts", () => {
    expect(isOriginalDocumentRequired("correction")).toBe(true);
    expect(isOriginalDocumentRequired("reversal")).toBe(true);
    expect(isOriginalDocumentRequired("normal")).toBe(false);
    expect(isOriginalDocumentRequired("repost")).toBe(false);
  });
});
