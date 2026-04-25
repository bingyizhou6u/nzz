import { describe, expect, it } from "vitest";
import { previewGroups, waitingLabel } from "./reviewModel";
import type { ApprovalPreviewState } from "./reviewTypes";

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

describe("review preview groups", () => {
  it("groups populated preview rows by operational impact", () => {
    const groups = previewGroups({
      ...emptyPreview,
      accountEntries: [{ accountId: "acct_cash", currencyCode: "AED", amountMinor: -1200, entryDate: "2026-04-25" }],
      lotCreations: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 1000 }],
      pendingCostApplications: [{ pendingCostMatchId: "pcm_1", appliedAmountMinor: 500 }],
      loanAllocations: [{ loanItemId: "loan_1", amountMinor: 300 }]
    });

    expect(groups.map((group) => group.title)).toEqual([
      "账户影响",
      "FIFO批次影响",
      "备用金待匹配",
      "借款影响"
    ]);
    expect(groups.map((group) => group.count)).toEqual([1, 1, 1, 1]);
  });

  it("filters empty preview groups", () => {
    expect(previewGroups(emptyPreview)).toEqual([]);
  });
});
