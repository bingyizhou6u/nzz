// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmAction, RecordList, WorkflowStepper, type RecordListItem } from "./interaction";

let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  document.body.replaceChildren();
});

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });

  return container;
}

async function click(element: Element | null | undefined) {
  if (!element) {
    throw new Error("Expected clickable element to exist");
  }

  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("formal interaction primitives", () => {
  it("marks the active workflow step with aria-current semantics", async () => {
    const container = await render(
      createElement(WorkflowStepper, {
        steps: [
          { id: "draft", label: "录入" },
          { id: "review", label: "审核" },
          { id: "posted", label: "入账" },
        ],
        currentStepId: "review",
      })
    );

    const currentStep = container.querySelector('[aria-current="step"]');

    expect(currentStep?.textContent).toContain("审核");
    expect(currentStep?.getAttribute("data-state")).toBe("current");
    expect(container.querySelectorAll(".workflow-stepper-step")).toHaveLength(3);
  });

  it("renders selectable records with selected state and reusable meta/status slots", async () => {
    const onSelect = vi.fn();
    type TestRecord = RecordListItem & { meta: string };
    const items: TestRecord[] = [
      { id: "doc-1", title: "项目收入单", description: "A 项目", meta: "2026-04" },
      { id: "doc-2", title: "备用金报销", description: "B 项目", meta: "2026-05" },
    ];
    const container = await render(
      createElement(RecordList<TestRecord>, {
        items,
        selectedId: "doc-2",
        onSelect,
        renderMeta: (item) => createElement("span", null, item.meta),
        renderStatus: (item) => createElement("strong", null, item.id === "doc-2" ? "待审核" : "草稿"),
      })
    );

    const records = container.querySelectorAll(".record-list-item");
    const selectedRecord = container.querySelector('[aria-selected="true"]');

    expect(records).toHaveLength(2);
    expect(selectedRecord?.textContent).toContain("备用金报销");
    expect(selectedRecord?.textContent).toContain("2026-05");
    expect(selectedRecord?.textContent).toContain("待审核");

    await click(records[0]);

    expect(onSelect).toHaveBeenCalledWith("doc-1", expect.objectContaining({ id: "doc-1" }));
  });

  it("requires a second confirmation before running dangerous actions", async () => {
    const onConfirm = vi.fn();
    const container = await render(
      createElement(ConfirmAction, {
        label: "删除单据",
        confirmLabel: "确认删除",
        cancelLabel: "取消",
        onConfirm,
      })
    );

    await click(container.querySelector("button"));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(container.textContent).toContain("确认删除");
    expect(container.textContent).toContain("取消");

    await click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "确认删除"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("supports disabled busy actions with loading copy", async () => {
    const onConfirm = vi.fn();
    const container = await render(
      createElement(ConfirmAction, {
        label: "锁账",
        confirmLabel: "确认锁账",
        busyLabel: "锁账中",
        disabled: true,
        busy: true,
        onConfirm,
      })
    );

    const trigger = container.querySelector("button");

    expect(trigger?.textContent).toBe("锁账中");
    expect(trigger?.hasAttribute("disabled")).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
