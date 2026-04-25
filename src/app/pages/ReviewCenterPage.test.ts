import { describe, expect, it } from "vitest";
import { canRenderReviewCenter } from "./ReviewCenterPage";

describe("review center page guard", () => {
  it("requires document approval capability", () => {
    expect(canRenderReviewCenter(["session.view", "documents.approve"])).toBe(true);
    expect(canRenderReviewCenter(["session.view", "documents.previewApproval"])).toBe(false);
    expect(canRenderReviewCenter([])).toBe(false);
  });
});
