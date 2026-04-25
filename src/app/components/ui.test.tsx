// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AmountCell, EmptyState, Notice, SectionTitle, StatusTag } from "./ui";

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

describe("formal ui primitives", () => {
  it("renders status tags with semantic tones", async () => {
    const container = await render(createElement(StatusTag, { tone: "warning", children: "待处理" }));

    expect(container.querySelector(".status-tag.warning")?.textContent).toBe("待处理");
  });

  it("formats amount cells as right-aligned mono text", async () => {
    const container = await render(createElement(AmountCell, { value: "1,200.00", currency: "USDT" }));
    const amountCell = container.querySelector(".amount-cell");

    expect(amountCell?.textContent).toContain("1,200.00");
    expect(amountCell?.textContent).toContain("USDT");
  });

  it("renders empty and notice states", async () => {
    const container = await render(
      createElement(
        "div",
        null,
        createElement(EmptyState, { title: "暂无任务", message: "当前没有待处理事项" }),
        createElement(Notice, { tone: "danger", children: "读取失败" })
      )
    );

    expect(container.querySelector(".empty-state")?.textContent).toContain("暂无任务");
    expect(container.querySelector(".notice.danger")?.textContent).toBe("读取失败");
  });

  it("renders section titles with optional descriptions", async () => {
    const container = await render(createElement(SectionTitle, { title: "资金概览", description: "按币种汇总余额" }));

    expect(container.querySelector(".section-title h2")?.textContent).toBe("资金概览");
    expect(container.querySelector(".section-title p")?.textContent).toBe("按币种汇总余额");
  });
});
