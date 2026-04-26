import { describe, expect, it } from "vitest";
import {
  previewGroups,
  reviewActionAvailability,
  reviewRiskTone,
  sortReviewQueueByRisk,
  waitingLabel
} from "./reviewModel";
import type { ApprovalPreviewState, ReviewDocumentRow } from "./reviewTypes";

const emptyPreview: ApprovalPreviewState = {
  accountEntries: [],
  loanEntries: [],
  lotCreations: [],
  lotUpdates: [],
  lotMovements: [],
  pendingCostCreations: [],
  pendingCostUpdates: [],
  pendingCostApplications: [],
  loanItemCreations: [],
  loanItemUpdates: [],
  loanAllocations: []
};

describe("review waiting labels", () => {
  it("labels missing submitted time as unrecorded", () => {
    expect(waitingLabel(null, new Date("2026-04-25T12:00:00Z"))).toBe("未记录");
  });

  it("rounds recent waits into hours and days", () => {
    const now = new Date("2026-04-25T12:00:00Z");

    expect(waitingLabel("2026-04-25T11:30:00Z", now)).toBe("1 小时内");
    expect(waitingLabel("2026-04-25T02:00:00Z", now)).toBe("10 小时");
    expect(waitingLabel("2026-04-23T11:00:00Z", now)).toBe("2 天");
  });
});

describe("review risk tone", () => {
  it("marks submitted documents as warning once they have waited at least three days", () => {
    const now = new Date("2026-04-25T12:00:00Z");

    expect(reviewRiskTone({ submitted_at: "2026-04-22T12:00:00Z" }, now)).toBe("warning");
    expect(reviewRiskTone({ submitted_at: "2026-04-21T11:00:00Z" }, now)).toBe("warning");
  });

  it("marks submitted documents under three days as ok", () => {
    expect(reviewRiskTone({ submitted_at: "2026-04-23T12:00:00Z" }, new Date("2026-04-25T12:00:00Z"))).toBe("ok");
  });

  it("mutes missing or invalid submitted timestamps", () => {
    const now = new Date("2026-04-25T12:00:00Z");

    expect(reviewRiskTone({ submitted_at: null }, now)).toBe("muted");
    expect(reviewRiskTone({ submitted_at: undefined }, now)).toBe("muted");
    expect(reviewRiskTone({ submitted_at: "invalid" }, now)).toBe("muted");
  });
});

describe("review queue ordering", () => {
  it("orders riskier and longer-waiting documents first without mutating the source list", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const fresh = reviewDocument({ id: "fresh", document_no: "DOC-FRESH", submitted_at: "2026-04-25T10:00:00Z" });
    const stale = reviewDocument({ id: "stale", document_no: "DOC-STALE", submitted_at: "2026-04-20T09:00:00Z" });
    const missing = reviewDocument({ id: "missing", document_no: "DOC-MISSING", submitted_at: null });
    const input = [fresh, missing, stale];

    const sorted = sortReviewQueueByRisk(input, now);

    expect(sorted.map((document) => document.id)).toEqual(["stale", "fresh", "missing"]);
    expect(input.map((document) => document.id)).toEqual(["fresh", "missing", "stale"]);
  });
});

describe("review preview groups", () => {
  it("groups populated preview rows by formal review impact", () => {
    const groups = previewGroups({
      ...emptyPreview,
      lotCreations: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 1000 }],
      pendingCostApplications: [{ pendingCostMatchId: "pcm_1", appliedAmountMinor: 500 }],
      loanAllocations: [{ loanItemId: "loan_1", amountMinor: 300 }],
      accountEntries: [{ accountId: "acct_cash", currencyCode: "AED", amountMinor: -1200, entryDate: "2026-04-25" }]
    }, reviewDocument({ document_type: "project_income", project_id: "project_1", merchant_id: "merchant_1" }));

    expect(groups.map((group) => group.title)).toEqual(["资金影响", "备用金影响", "借款影响", "项目影响"]);
    expect(groups.map((group) => group.count)).toEqual([2, 1, 1, 1]);
  });

  it("filters empty preview groups", () => {
    expect(previewGroups(emptyPreview)).toEqual([]);
  });
});

describe("review action availability", () => {
  it("enables approval only after a selected document has a ready preview and no busy action", () => {
    expect(reviewActionAvailability({ selectedId: null, previewState: "ready", actionKey: null, rejectReason: "原因" }).canApprove).toBe(false);
    expect(reviewActionAvailability({ selectedId: "doc_1", previewState: "loading", actionKey: null, rejectReason: "原因" }).canApprove).toBe(false);
    expect(reviewActionAvailability({ selectedId: "doc_1", previewState: "ready", actionKey: "approve", rejectReason: "原因" }).canApprove).toBe(false);
    expect(reviewActionAvailability({ selectedId: "doc_1", previewState: "ready", actionKey: null, rejectReason: "原因" }).canApprove).toBe(true);
  });

  it("requires a selected document and a non-empty reject reason before rejecting", () => {
    expect(reviewActionAvailability({ selectedId: "doc_1", previewState: "ready", actionKey: null, rejectReason: "" }).canReject).toBe(false);
    expect(reviewActionAvailability({ selectedId: null, previewState: "ready", actionKey: null, rejectReason: "资料不完整" }).canReject).toBe(false);
    expect(reviewActionAvailability({ selectedId: "doc_1", previewState: "ready", actionKey: null, rejectReason: " 资料不完整 " }).canReject).toBe(true);
  });
});

function reviewDocument(overrides: Partial<ReviewDocumentRow> = {}): ReviewDocumentRow {
  return {
    id: "doc_1",
    document_no: "DOC-001",
    document_type: "manual_adjustment",
    business_date: "2026-04-25",
    period: "2026-04",
    submitted_at: "2026-04-25T10:00:00Z",
    summary: "待审核单据",
    created_by: "user_1",
    operator_person_id: "person_1",
    project_id: null,
    merchant_id: null,
    ...overrides
  };
}
