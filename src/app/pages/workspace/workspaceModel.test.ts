import { describe, expect, it } from "vitest";
import {
  buildWorkspaceNextActions,
  buildWorkspaceTasks,
  summarizeDocumentCounts,
  type WorkspaceDocument
} from "./workspaceModel";

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

  it("builds ordered next actions from document counts and permissions", () => {
    expect(
      buildWorkspaceNextActions(
        { draft: 2, pending: 3, rejected: 1, approved: 5 },
        ["session.view", "documents.view", "documents.submit", "documents.approve", "periodLocks.view"]
      )
    ).toEqual([
      {
        id: "pending-review",
        title: "审核待处理单据",
        description: "3 张单据等待审核，先完成审核再进入报表或月结。",
        meta: "3 张待审核",
        page: "review",
        tone: "warning"
      },
      {
        id: "rejected-documents",
        title: "修正退回单据",
        description: "1 张单据被退回，需要修正后重新提交。",
        meta: "1 张已退回",
        page: "documents",
        tone: "danger"
      },
      {
        id: "draft-documents",
        title: "提交草稿单据",
        description: "2 张草稿尚未提交，确认字段后提交审核。",
        meta: "2 张草稿",
        page: "documents",
        tone: "muted"
      },
      {
        id: "month-close-checks",
        title: "检查月结异常",
        description: "运行月结检查并处理阻断项，确认期间是否可以锁账。",
        meta: "月结检查",
        page: "month-close",
        tone: "default"
      }
    ]);
  });

  it("routes pending documents to the document center when the user cannot approve", () => {
    expect(
      buildWorkspaceNextActions({ draft: 0, pending: 2, rejected: 0, approved: 0 }, ["session.view", "documents.view"])
    ).toEqual([
      {
        id: "pending-documents",
        title: "查看待审核单据",
        description: "2 张单据已经提交，当前账号可查看但不能审核。",
        meta: "2 张待审核",
        page: "documents",
        tone: "warning"
      }
    ]);
  });

  it("falls back to useful entry actions when there are no document tasks", () => {
    expect(
      buildWorkspaceNextActions(
        { draft: 0, pending: 0, rejected: 0, approved: 4 },
        ["session.view", "documents.view", "documents.create", "reports.view"]
      )
    ).toEqual([
      {
        id: "create-document",
        title: "录入业务单据",
        description: "从收入、换汇、备用金、借款或冲正业务开始录入。",
        meta: "常用入口",
        page: "documents",
        tone: "default"
      },
      {
        id: "view-reports",
        title: "查看管理报表",
        description: "查看资金、项目、费用、备用金、借款和异常报表。",
        meta: "常用入口",
        page: "reports",
        tone: "default"
      }
    ]);
  });
});
