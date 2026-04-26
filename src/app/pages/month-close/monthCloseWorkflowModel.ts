import type { WorkflowStepState } from "../../components/interaction";
import type { MonthCloseCheckResult, MonthCloseOverview, MonthClosePeriod } from "./monthCloseTypes";

export type MonthCloseWorkflowStepId =
  | "select-period"
  | "run-checks"
  | "handle-exceptions"
  | "reconcile"
  | "lock-snapshot";

export interface MonthCloseWorkflowStep {
  id: MonthCloseWorkflowStepId;
  label: string;
  description: string;
  state: WorkflowStepState;
}

export interface MonthCloseWorkflowInput {
  period: MonthClosePeriod | null;
  overview: MonthCloseOverview | null;
  isRunning?: boolean;
}

export interface MonthCloseWorkflowState {
  steps: MonthCloseWorkflowStep[];
  currentStepId: MonthCloseWorkflowStepId;
  currentDescription: string;
  blockerCount: number;
  canLock: boolean;
  canUnlock: boolean;
}

const STEP_DEFINITIONS: Array<Omit<MonthCloseWorkflowStep, "state">> = [
  {
    id: "select-period",
    label: "选择期间",
    description: "确认需要月结的会计期间"
  },
  {
    id: "run-checks",
    label: "运行检查",
    description: "重新计算单据、账户、备用金和项目异常"
  },
  {
    id: "handle-exceptions",
    label: "处理异常",
    description: "分配、确认、解决或保留阻塞项"
  },
  {
    id: "reconcile",
    label: "对账确认",
    description: "核对资金、备用金、借款和项目汇总"
  },
  {
    id: "lock-snapshot",
    label: "锁账快照",
    description: "生成锁账快照并冻结期间数据"
  }
];

const CURRENT_DESCRIPTIONS: Record<MonthCloseWorkflowStepId, string> = {
  "select-period": "请选择一个需要处理的月结期间。",
  "run-checks": "请先运行月结检查，生成异常清单。",
  "handle-exceptions": "仍有阻塞项需要处理后才能锁账。",
  reconcile: "检查已通过，请核对对账报表后锁账。",
  "lock-snapshot": "期间可锁账，锁账后会生成快照版本。"
};

export function monthCloseWorkflowState(input: MonthCloseWorkflowInput): MonthCloseWorkflowState {
  const { period, overview, isRunning = false } = input;
  const blockerCount = countBlockingChecks(overview?.checks ?? [], period);

  const locked = Boolean(period?.locked_at || overview?.periodLock);
  const hasRun = Boolean(period?.latest_run_id || overview?.latestRun);
  const runStatus = overview?.latestRun?.status ?? period?.latest_run_status ?? null;
  const canLockFromRun = Boolean((overview?.latestRun?.can_lock ?? period?.can_lock ?? 0) === 1);

  let currentStepId: MonthCloseWorkflowStepId = "select-period";
  let currentDescription = CURRENT_DESCRIPTIONS[currentStepId];
  let canLock = false;
  const canUnlock = Boolean(period && locked);

  if (period) {
    if (locked) {
      currentStepId = "lock-snapshot";
      currentDescription = "期间已锁账，快照版本会保留。";
    } else if (isRunning || runStatus === "running") {
      currentStepId = "run-checks";
      currentDescription = "正在重新计算月结检查结果。";
    } else if (!hasRun || runStatus === "failed") {
      currentStepId = "run-checks";
      currentDescription = runStatus === "failed" ? "检查失败，请重新运行月结检查。" : CURRENT_DESCRIPTIONS["run-checks"];
    } else if (blockerCount > 0 || !canLockFromRun) {
      currentStepId = "handle-exceptions";
      currentDescription = CURRENT_DESCRIPTIONS["handle-exceptions"];
    } else {
      currentStepId = "lock-snapshot";
      currentDescription = CURRENT_DESCRIPTIONS["lock-snapshot"];
      canLock = true;
    }
  }

  return {
    steps: buildSteps(currentStepId),
    currentStepId,
    currentDescription,
    blockerCount,
    canLock,
    canUnlock
  };
}

function buildSteps(currentStepId: MonthCloseWorkflowStepId): MonthCloseWorkflowStep[] {
  const currentIndex = STEP_DEFINITIONS.findIndex((step) => step.id === currentStepId);

  return STEP_DEFINITIONS.map((step, index) => ({
    ...step,
    state: stepState(index, currentIndex)
  }));
}

function stepState(index: number, currentIndex: number): WorkflowStepState {
  if (index === currentIndex) return "current";
  if (currentIndex >= 0 && index < currentIndex) return "complete";
  return "upcoming";
}

function countBlockingChecks(checks: MonthCloseCheckResult[], period: MonthClosePeriod | null): number {
  if (checks.length > 0) {
    return checks.filter(isBlockingCheck).length;
  }

  return (period?.critical_count ?? 0) + (period?.warning_count ?? 0);
}

function isBlockingCheck(check: MonthCloseCheckResult): boolean {
  const isBlockingSeverity = check.severity === "critical" || check.severity === "warning";
  const isOpenStatus = check.status === "open" || check.status === "assigned";
  return isBlockingSeverity && isOpenStatus;
}
