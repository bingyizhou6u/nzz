import { describe, expect, it } from "vitest";
import { monthCloseWorkflowState } from "./monthCloseWorkflowModel";
import type { MonthCloseCheckResult, MonthCloseOverview, MonthClosePeriod } from "./monthCloseTypes";

describe("monthCloseWorkflowState", () => {
  it("marks run checks as current when a period has not been checked", () => {
    const workflow = monthCloseWorkflowState({
      period: periodRow({ latest_run_id: null, latest_run_status: null, can_lock: 0 }),
      overview: overview({ latestRun: null, checks: [] })
    });

    expect(workflow.currentStepId).toBe("run-checks");
    expect(stepStates(workflow)).toEqual([
      ["select-period", "complete"],
      ["run-checks", "current"],
      ["handle-exceptions", "upcoming"],
      ["reconcile", "upcoming"],
      ["lock-snapshot", "upcoming"]
    ]);
    expect(workflow.canLock).toBe(false);
  });

  it("keeps run checks current while checks are running", () => {
    const workflow = monthCloseWorkflowState({
      period: periodRow({ latest_run_status: "running" }),
      overview: overview({ latestRun: { ...run(), status: "running", can_lock: 0 }, checks: [] }),
      isRunning: true
    });

    expect(workflow.currentStepId).toBe("run-checks");
    expect(workflow.currentDescription).toBe("正在重新计算月结检查结果。");
  });

  it("marks exception handling as current when blockers remain", () => {
    const workflow = monthCloseWorkflowState({
      period: periodRow({ can_lock: 0, critical_count: 1, warning_count: 1 }),
      overview: overview({
        latestRun: run({ can_lock: 0, critical_count: 1, warning_count: 1 }),
        checks: [check({ severity: "critical", status: "open" }), check({ id: "warning_1", severity: "warning", status: "assigned" })]
      })
    });

    expect(workflow.currentStepId).toBe("handle-exceptions");
    expect(workflow.blockerCount).toBe(2);
    expect(workflow.canLock).toBe(false);
  });

  it("marks the snapshot lock step as current when checks are lockable", () => {
    const workflow = monthCloseWorkflowState({
      period: periodRow({ can_lock: 1, critical_count: 0, warning_count: 0 }),
      overview: overview({ latestRun: run({ can_lock: 1, critical_count: 0, warning_count: 0 }), checks: [] })
    });

    expect(workflow.currentStepId).toBe("lock-snapshot");
    expect(stepStates(workflow).at(-1)).toEqual(["lock-snapshot", "current"]);
    expect(workflow.canLock).toBe(true);
  });

  it("marks locked periods as final and unlockable", () => {
    const workflow = monthCloseWorkflowState({
      period: periodRow({ locked_at: "2026-04-30T11:00:00.000Z", locked_by: "manager_1", can_lock: 0 }),
      overview: overview({
        periodLock: { period: "2026-04", locked_by: "manager_1", locked_at: "2026-04-30T11:00:00.000Z", note: "closed" }
      })
    });

    expect(workflow.currentStepId).toBe("lock-snapshot");
    expect(workflow.currentDescription).toBe("期间已锁账，快照版本会保留。");
    expect(workflow.canLock).toBe(false);
    expect(workflow.canUnlock).toBe(true);
  });
});

function stepStates(workflow: ReturnType<typeof monthCloseWorkflowState>) {
  return workflow.steps.map((step) => [step.id, step.state] as const);
}

function periodRow(overrides: Partial<MonthClosePeriod> = {}): MonthClosePeriod {
  return {
    period: "2026-04",
    latest_run_id: "run_1",
    latest_run_status: "completed",
    can_lock: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    locked_at: null,
    locked_by: null,
    snapshot_count: 0,
    latest_snapshot_version: null,
    ...overrides
  };
}

function run(overrides: Partial<MonthCloseOverview["latestRun"]> = {}): NonNullable<MonthCloseOverview["latestRun"]> {
  return {
    id: "run_1",
    period: "2026-04",
    status: "completed",
    can_lock: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    started_by: "manager_1",
    started_at: "2026-04-30T10:00:00.000Z",
    finished_at: "2026-04-30T10:05:00.000Z",
    error_message: null,
    ...overrides
  };
}

function overview(overrides: Partial<MonthCloseOverview> = {}): MonthCloseOverview {
  return {
    period: "2026-04",
    latestRun: run(),
    periodLock: null,
    checks: [],
    snapshots: [],
    ...overrides
  };
}

function check(overrides: Partial<MonthCloseCheckResult> = {}): MonthCloseCheckResult {
  return {
    id: "check_1",
    run_id: "run_1",
    period: "2026-04",
    check_type: "pending_document",
    severity: "critical",
    entity_type: "document",
    entity_id: "doc_1",
    business_date: "2026-04-25",
    currency_code: null,
    amount_minor: null,
    usdt_cost_minor: null,
    message: "仍有待处理单据",
    suggested_action: "处理后再锁账",
    status: "open",
    assignee_person_id: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: "2026-04-30T10:00:00.000Z",
    ...overrides
  };
}
