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
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.replaceChildren(host);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => authenticatedMeResponse
      }))
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
});
