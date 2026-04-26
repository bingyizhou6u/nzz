// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MasterDataTable } from "./MasterDataTable";

describe("MasterDataTable", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.replaceChildren();
  });

  it("exposes a keyboard-focusable scroll region and table hint", async () => {
    await act(async () => {
      root.render(
        <MasterDataTable
          rows={[{ id: "person_1", name: "Alice", status: "active" }]}
          getRowKey={(row) => row.id}
          emptyText="暂无人员"
          columns={[
            { key: "name", header: "姓名", render: (row) => row.name },
            { key: "status", header: "状态", render: (row) => row.status }
          ]}
        />
      );
    });

    const tableRegion = document.querySelector(".master-data-table-wrap");
    expect(tableRegion?.getAttribute("role")).toBe("region");
    expect(tableRegion?.getAttribute("aria-label")).toContain("基础资料表格");
    expect(tableRegion?.getAttribute("tabindex")).toBe("0");
    expect(document.querySelector(".table-scroll-hint")?.textContent).toContain("横向滚动");
  });
});
