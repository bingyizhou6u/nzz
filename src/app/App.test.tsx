// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const authenticatedMeResponse = {
  data: {
    person: {
      id: "person_finance",
      name: "Finance Manager",
      alias: "fm",
      loginEmail: "finance@example.com",
      roles: ["finance_manager"]
    },
    capabilities: ["session.view", "documents.view"]
  }
};

async function waitFor(assertion: () => void) {
  const deadline = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }

  throw lastError;
}

describe("App", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.replaceChildren(host);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        const pathname = url.startsWith("http") ? new URL(url).pathname : url;
        const data = pathname === "/api/me" ? authenticatedMeResponse : { data: [] };

        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => data
        };
      })
    );
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("renders workspace content for the default authenticated navigation target", async () => {
    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => {
      expect(document.querySelector("main")?.textContent).toContain("工作台");
    });
  });

  it("renders the formal shell sidebar and top status for authenticated users", async () => {
    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => {
      expect(document.querySelector(".app-sidebar")?.textContent).toContain("工作台");
      expect(document.querySelector(".top-status-bar")?.textContent).toContain("Finance Manager");
    });
  });

  it("switches pages from the sidebar navigation", async () => {
    await act(async () => {
      root.render(<App />);
    });

    await waitFor(() => {
      expect(document.querySelector(".app-sidebar")?.textContent).toContain("业务单据");
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>(".app-sidebar button[data-page-key='documents']")?.click();
    });

    await waitFor(() => {
      expect(document.querySelector(".sidebar-nav-button.active")?.textContent).toContain("业务单据");
      expect(document.querySelector("main")?.textContent).toContain("单据列表");
    });
  });
});
