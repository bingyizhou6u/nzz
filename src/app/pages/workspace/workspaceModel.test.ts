import { describe, expect, it } from "vitest";
import { buildWorkspaceTasks, summarizeDocumentCounts, type WorkspaceDocument } from "./workspaceModel";

describe("workspace model", () => {
  const documents: WorkspaceDocument[] = [
    {
      id: "doc_1",
      document_no: "D-001",
      document_type: "project_income",
      business_date: "2026-04-24",
      status: "draft",
      summary: "收入草稿"
    },
    {
      id: "doc_2",
      document_no: "D-002",
      document_type: "exchange",
      business_date: "2026-04-24",
      status: "pending",
      summary: "换汇待审"
    },
    {
      id: "doc_3",
      document_no: "D-003",
      document_type: "loan_out",
      business_date: "2026-04-23",
      status: "rejected",
      summary: "借款退回"
    },
    {
      id: "doc_4",
      document_no: "D-004",
      document_type: "account_transfer",
      business_date: "2026-04-22",
      status: "approved",
      summary: "已审核划转"
    },
    {
      id: "doc_5",
      document_no: "D-005",
      document_type: "manual_adjustment",
      business_date: "2026-04-21",
      status: "void",
      summary: "未知状态"
    }
  ];

  it("summarizes known document counts by workflow status", () => {
    expect(summarizeDocumentCounts(documents)).toEqual({ draft: 1, pending: 1, rejected: 1, approved: 1 });
  });

  it("builds actionable workspace tasks in input order", () => {
    expect(buildWorkspaceTasks(documents)).toEqual([
      {
        id: "doc_1",
        label: "收入草稿",
        meta: "D-001 / 2026-04-24",
        status: "draft"
      },
      {
        id: "doc_2",
        label: "换汇待审",
        meta: "D-002 / 2026-04-24",
        status: "pending"
      },
      {
        id: "doc_3",
        label: "借款退回",
        meta: "D-003 / 2026-04-23",
        status: "rejected"
      }
    ]);
  });

  it("uses the document number when summary is empty", () => {
    expect(
      buildWorkspaceTasks([
        {
          id: "doc_empty",
          document_no: "D-EMPTY",
          document_type: "exchange",
          business_date: "2026-04-20",
          status: "draft",
          summary: ""
        }
      ])[0]?.label
    ).toBe("D-EMPTY");
  });

  it("keeps at most eight actionable tasks and ignores approved or unknown statuses", () => {
    const manyDocuments: WorkspaceDocument[] = Array.from({ length: 12 }, (_, index) => ({
      id: `doc_${index + 1}`,
      document_no: `D-${String(index + 1).padStart(3, "0")}`,
      document_type: "project_income",
      business_date: "2026-04-24",
      status: index === 2 ? "approved" : index === 5 ? "void" : "pending",
      summary: `任务 ${index + 1}`
    }));

    const tasks = buildWorkspaceTasks(manyDocuments);

    expect(tasks).toHaveLength(8);
    expect(tasks.map((task) => task.id)).toEqual([
      "doc_1",
      "doc_2",
      "doc_4",
      "doc_5",
      "doc_7",
      "doc_8",
      "doc_9",
      "doc_10"
    ]);
  });
});
