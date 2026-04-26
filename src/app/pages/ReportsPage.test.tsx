// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "./ReportsPage";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }

  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReportsPage", () => {
  it("shows one report group at a time instead of stacking every report table", async () => {
    vi.stubGlobal("fetch", emptyReportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    const detailRegion = reportDetailRegion(container);
    expect(detailRegion.getAttribute("role")).toBe("tabpanel");
    expect(detailRegion.textContent).toContain("账户余额表");
    expect(detailRegion.textContent).toContain("FIFO 消耗明细");
    expect(detailRegion.textContent).not.toContain("项目收支表");
    expect(container.querySelectorAll(".report-category-button")).toHaveLength(6);
  });

  it("switches report groups from the category navigation", async () => {
    vi.stubGlobal("fetch", emptyReportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "项目经营4 张表").click();
    });

    const detailRegion = reportDetailRegion(container);
    expect(detailRegion.getAttribute("aria-labelledby")).toBe("report-group-tab-project");
    expect(detailRegion.textContent).toContain("项目收支表");
    expect(detailRegion.textContent).toContain("商户收入表");
    expect(detailRegion.textContent).not.toContain("账户余额表");
    expect(buttonByText(container, "项目经营4 张表").getAttribute("aria-selected")).toBe("true");
  });

  it("supports keyboard switching between report categories", async () => {
    vi.stubGlobal("fetch", emptyReportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "资金3 张表").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    expect(reportDetailRegion(container).textContent).toContain("项目收支表");
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function emptyReportFetch() {
  return vi.fn<FetchHandler>().mockImplementation(async () => jsonResponse({ data: [] }));
}

async function renderReportsPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ReportsPage));
  });

  return container;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

function reportDetailRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector(".report-detail-region");
  if (!(region instanceof HTMLElement)) {
    throw new Error("Report detail region not found");
  }
  return region;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}
