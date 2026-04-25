import { describe, expect, it } from "vitest";
import { canRenderReviewCenter, clearedReviewActionState, reviewActionRefreshFailureState } from "./ReviewCenterPage";

describe("review center page guard", () => {
  it("requires document approval capability", () => {
    expect(canRenderReviewCenter(["session.view", "documents.approve"])).toBe(true);
    expect(canRenderReviewCenter(["session.view", "documents.previewApproval"])).toBe(false);
    expect(canRenderReviewCenter([])).toBe(false);
  });
});

describe("review action state", () => {
  it("clears approvable document state before refreshing the queue", () => {
    expect(clearedReviewActionState("已通过审核")).toEqual({
      documents: [],
      selectedId: null,
      detail: null,
      preview: null,
      detailState: "idle",
      previewState: "idle",
      rejectReason: "",
      actionMessage: "已通过审核"
    });
  });

  it("keeps approval disabled when action succeeds but queue refresh fails", () => {
    expect(reviewActionRefreshFailureState("已通过审核", new Error("刷新失败"))).toEqual({
      documents: [],
      selectedId: null,
      detail: null,
      preview: null,
      detailState: "idle",
      previewState: "idle",
      rejectReason: "",
      actionMessage: "已通过审核",
      queueState: "error",
      error: "刷新失败"
    });
  });
});
