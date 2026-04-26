// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MonthCloseSnapshotsTab } from "./MonthCloseSnapshotsTab";

describe("MonthCloseSnapshotsTab", () => {
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

  it("keeps the snapshot table inside a keyboard-focusable scroll region", async () => {
    await act(async () => {
      root.render(
        <MonthCloseSnapshotsTab
          isLoading={false}
          snapshots={[
            {
              id: "snapshot_1",
              period: "2026-04",
              version: 1,
              run_id: "run_1",
              locked_by: "person_admin",
              locked_at: "2026-04-25T00:00:00Z",
              note: "演示快照",
              summary_json: "{}"
            }
          ]}
        />
      );
    });

    const tableRegion = document.querySelector(".month-close-snapshots-table-wrap");
    expect(tableRegion?.getAttribute("role")).toBe("region");
    expect(tableRegion?.getAttribute("aria-label")).toContain("月结快照");
    expect(tableRegion?.getAttribute("tabindex")).toBe("0");
    expect(document.querySelector(".table-scroll-hint")?.textContent).toContain("横向滚动");
  });
});
