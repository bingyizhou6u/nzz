import { describe, expect, it } from "vitest";
import {
  buildCheckActionPatch,
  canHandleMonthCloseChecks,
  canRunMonthCloseChecks,
  monthCloseCheckStatusLabel,
  monthClosePeriodStatus,
  severityTone
} from "./monthCloseModel";
import type { MonthCloseCheckResult, MonthClosePeriod } from "./monthCloseTypes";

const basePeriod: MonthClosePeriod = {
  period: "2026-04",
  latest_run_id: "run_1",
  latest_run_status: "completed",
  can_lock: 0,
  critical_count: 1,
  warning_count: 2,
  info_count: 3,
  locked_at: null,
  locked_by: null,
  snapshot_count: 0,
  latest_snapshot_version: null
};

describe("month close model", () => {
  it("derives period status from lock and latest run state", () => {
    expect(monthClosePeriodStatus({ ...basePeriod, locked_at: "2026-04-30T10:00:00.000Z" })).toMatchObject({
      key: "locked",
      label: "已锁账",
      tone: "ok"
    });
    expect(monthClosePeriodStatus({ ...basePeriod, latest_run_status: "running" })).toMatchObject({
      key: "checking",
      label: "检查中",
      tone: "warning"
    });
    expect(monthClosePeriodStatus({ ...basePeriod, latest_run_status: "failed" })).toMatchObject({
      key: "failed",
      label: "检查失败",
      tone: "danger"
    });
    expect(monthClosePeriodStatus({ ...basePeriod, can_lock: 1, critical_count: 0, warning_count: 0 })).toMatchObject({
      key: "ready",
      label: "可锁账",
      tone: "ok"
    });
    expect(monthClosePeriodStatus({ ...basePeriod, latest_run_id: null, latest_run_status: null })).toMatchObject({
      key: "not_checked",
      label: "未检查",
      tone: "muted"
    });
  });

  it("maps severity and handling statuses to Chinese labels", () => {
    expect(severityTone("critical")).toBe("danger");
    expect(severityTone("warning")).toBe("warning");
    expect(severityTone("info")).toBe("muted");
    expect(monthCloseCheckStatusLabel("open")).toBe("未处理");
    expect(monthCloseCheckStatusLabel("acknowledged")).toBe("已确认");
    expect(monthCloseCheckStatusLabel("waived")).toBe("确认保留");
  });

  it("checks run and handling capabilities", () => {
    expect(canRunMonthCloseChecks(["periodLocks.view", "periodLocks.lock"])).toBe(true);
    expect(canRunMonthCloseChecks(["periodLocks.view"])).toBe(false);
    expect(canHandleMonthCloseChecks(["periodLocks.lock"])).toBe(true);
    expect(canHandleMonthCloseChecks(["reports.view"])).toBe(false);
  });

  it("builds patches for check result actions with notes and assignees", () => {
    const check = checkResult({ id: "check_warning", severity: "warning" });

    expect(buildCheckActionPatch(check, "resolve", { note: "补单已完成", assigneePersonId: "person_finance" })).toEqual({
      status: "resolved",
      resolutionNote: "补单已完成",
      assigneePersonId: "person_finance"
    });
    expect(buildCheckActionPatch(check, "acknowledge", { note: "差异已确认" })).toEqual({
      status: "acknowledged",
      resolutionNote: "差异已确认"
    });
    expect(buildCheckActionPatch(check, "assign", { assigneePersonId: "person_ops" })).toEqual({
      assigneePersonId: "person_ops"
    });
  });

  it("rejects waived critical checks and requires notes for retained warnings", () => {
    expect(() => buildCheckActionPatch(checkResult({ severity: "critical" }), "waive", { note: "保留" })).toThrow(
      "critical 检查不能确认保留"
    );
    expect(() => buildCheckActionPatch(checkResult({ severity: "warning" }), "waive", { note: "   " })).toThrow(
      "请填写处理说明"
    );
    expect(() => buildCheckActionPatch(checkResult({ severity: "warning" }), "assign", {})).toThrow("请选择责任人");
  });
});

function checkResult(overrides: Partial<MonthCloseCheckResult> = {}): MonthCloseCheckResult {
  return {
    id: "check_1",
    run_id: "run_1",
    period: "2026-04",
    check_type: "pending_document",
    severity: "critical",
    entity_type: "document",
    entity_id: "doc_pending",
    business_date: "2026-04-26",
    currency_code: null,
    amount_minor: null,
    usdt_cost_minor: null,
    message: "期间内存在待审核单据",
    suggested_action: "审核或退回该单据后再继续月结",
    status: "open",
    assignee_person_id: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: "2026-04-30T10:00:00.000Z",
    ...overrides
  };
}
