import { useEffect, useMemo, useState } from "react";
import { WorkflowStepper } from "../components/interaction";
import { Notice } from "../components/ui";
import {
  getMonthCloseOverview,
  getMonthCloseReconciliation,
  listMonthClosePeriods,
  listPeopleOptions,
  lockMonthClosePeriod,
  runMonthCloseChecks,
  unlockMonthClosePeriod,
  updateMonthCloseCheckResult
} from "./month-close/monthCloseApi";
import { MonthCloseChecksTab } from "./month-close/MonthCloseChecksTab";
import { MonthClosePeriodList } from "./month-close/MonthClosePeriodList";
import { MonthCloseReconciliationTabs } from "./month-close/MonthCloseReconciliationTabs";
import { MonthCloseSnapshotsTab } from "./month-close/MonthCloseSnapshotsTab";
import { MonthCloseStatusBar } from "./month-close/MonthCloseStatusBar";
import { canRunMonthCloseChecks, canUnlockMonthClosePeriod } from "./month-close/monthCloseModel";
import { monthCloseWorkflowState } from "./month-close/monthCloseWorkflowModel";
import type {
  MonthCloseCheckPatch,
  MonthCloseOverview,
  MonthClosePeriod,
  MonthCloseReconciliation,
  PersonOption
} from "./month-close/monthCloseTypes";

interface MonthClosePageProps {
  capabilities: string[];
}

export function MonthClosePage({ capabilities }: MonthClosePageProps) {
  const [periods, setPeriods] = useState<MonthClosePeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [periodInput, setPeriodInput] = useState(currentPeriodValue());
  const [overview, setOverview] = useState<MonthCloseOverview | null>(null);
  const [reconciliation, setReconciliation] = useState<MonthCloseReconciliation | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [lockNote, setLockNote] = useState("");
  const [unlockReason, setUnlockReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRunChecks = canRunMonthCloseChecks(capabilities);
  const canUnlockPeriod = canUnlockMonthClosePeriod(capabilities);

  const selectedPeriodRow = useMemo(
    () => periods.find((period) => period.period === selectedPeriod) ?? blankPeriod(selectedPeriod),
    [periods, selectedPeriod]
  );
  const workflow = useMemo(
    () => monthCloseWorkflowState({ period: selectedPeriodRow, overview, isRunning }),
    [selectedPeriodRow, overview, isRunning]
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadPeriods() {
      setIsLoadingPeriods(true);
      setError(null);
      try {
        const nextPeriods = await listMonthClosePeriods();
        if (!isCurrent) return;
        setPeriods(nextPeriods);
        setSelectedPeriod((current) => current || (nextPeriods[0]?.period ?? ""));
        if (nextPeriods[0]?.period) {
          setPeriodInput(nextPeriods[0].period);
        }
      } catch (loadError) {
        if (isCurrent) setError(errorMessage(loadError, "读取月结期间失败"));
      } finally {
        if (isCurrent) setIsLoadingPeriods(false);
      }
    }

    void loadPeriods();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPeriod) {
      setOverview(null);
      setReconciliation(null);
      return;
    }

    let isCurrent = true;

    async function loadOverview() {
      setIsLoadingOverview(true);
      setIsLoadingReconciliation(true);
      setError(null);
      try {
        const [nextOverview, nextReconciliation] = await Promise.all([
          getMonthCloseOverview(selectedPeriod),
          getMonthCloseReconciliation(selectedPeriod)
        ]);
        if (isCurrent) {
          setOverview(nextOverview);
          setReconciliation(nextReconciliation);
        }
      } catch (loadError) {
        if (isCurrent) setError(errorMessage(loadError, "读取月结检查结果失败"));
      } finally {
        if (isCurrent) setIsLoadingOverview(false);
        if (isCurrent) setIsLoadingReconciliation(false);
      }
    }

    void loadOverview();

    return () => {
      isCurrent = false;
    };
  }, [selectedPeriod]);

  useEffect(() => {
    if (!canRunChecks) return;
    let isCurrent = true;

    async function loadPeople() {
      try {
        const nextPeople = await listPeopleOptions();
        if (isCurrent) setPeople(nextPeople);
      } catch {
        if (isCurrent) setPeople([]);
      }
    }

    void loadPeople();

    return () => {
      isCurrent = false;
    };
  }, [canRunChecks]);

  async function refreshPeriods() {
    const nextPeriods = await listMonthClosePeriods();
    setPeriods(nextPeriods);
    return nextPeriods;
  }

  async function refreshSelectedOverview(period = selectedPeriod) {
    if (!period) return;
    const [nextOverview, nextReconciliation] = await Promise.all([
      getMonthCloseOverview(period),
      getMonthCloseReconciliation(period)
    ]);
    setOverview(nextOverview);
    setReconciliation(nextReconciliation);
  }

  async function handleRefresh() {
    setNotice(null);
    setError(null);
    setIsLoadingPeriods(true);
    setIsLoadingOverview(Boolean(selectedPeriod));
    setIsLoadingReconciliation(Boolean(selectedPeriod));
    try {
      await refreshPeriods();
      await refreshSelectedOverview();
      setNotice("已刷新月结中心数据。");
    } catch (refreshError) {
      setError(errorMessage(refreshError, "刷新月结中心失败"));
    } finally {
      setIsLoadingPeriods(false);
      setIsLoadingOverview(false);
      setIsLoadingReconciliation(false);
    }
  }

  async function handleRunChecks() {
    const period = periodInput || selectedPeriod;
    if (!period) return;
    setPeriodInput(period);
    setNotice(null);
    setError(null);
    setIsRunning(true);
    try {
      const result = await runMonthCloseChecks(period);
      setOverview({
        period,
        latestRun: result.run,
        periodLock: overview?.period === period ? overview.periodLock : null,
        checks: result.checks,
        snapshots: overview?.period === period ? overview.snapshots : []
      });
      setSelectedPeriod(period);
      await refreshPeriods();
      setReconciliation(await getMonthCloseReconciliation(period));
      setNotice(result.canLock ? "检查完成，当前期间可进入锁账确认。" : "检查完成，请先处理清单中的异常项。");
    } catch (runError) {
      setError(errorMessage(runError, "运行月结检查失败"));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleUpdateCheck(id: string, patch: MonthCloseCheckPatch) {
    setNotice(null);
    setError(null);
    setIsUpdating(true);
    try {
      const updated = await updateMonthCloseCheckResult(id, patch);
      setOverview((current) =>
        current
          ? {
              ...current,
              checks: current.checks.map((check) => (check.id === id ? updated : check))
            }
          : current
      );
      setNotice("检查项已更新。");
      await refreshPeriods();
      await refreshSelectedOverview();
    } catch (updateError) {
      setError(errorMessage(updateError, "更新检查项失败"));
      throw updateError;
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleLockPeriod() {
    const period = selectedPeriod;
    const note = lockNote.trim();
    if (!period) {
      setError("请先选择月结期间。");
      return;
    }
    if (!note) {
      setError("请填写锁账说明。");
      return;
    }

    setNotice(null);
    setError(null);
    setIsLocking(true);
    try {
      const result = await lockMonthClosePeriod(period, note);
      setLockNote("");
      await refreshPeriods();
      await refreshSelectedOverview(period);
      setNotice(`已锁账并生成快照 v${result.snapshot.version}。`);
    } catch (lockError) {
      setError(errorMessage(lockError, "锁账失败"));
    } finally {
      setIsLocking(false);
    }
  }

  async function handleUnlockPeriod() {
    const period = selectedPeriod;
    const reason = unlockReason.trim();
    if (!period) {
      setError("请先选择月结期间。");
      return;
    }
    if (!reason) {
      setError("请填写解锁原因。");
      return;
    }

    setNotice(null);
    setError(null);
    setIsUnlocking(true);
    try {
      await unlockMonthClosePeriod(period, reason);
      setUnlockReason("");
      await refreshPeriods();
      await refreshSelectedOverview(period);
      setNotice("已解锁当前期间，后续需要重新确认后再锁账。");
    } catch (unlockError) {
      setError(errorMessage(unlockError, "解锁失败"));
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <div className="page-stack month-close-workspace">
      <section className="panel month-close-toolbar">
        <div className="panel-header">
          <div>
            <h2>月结检查控制台</h2>
          </div>
          <div className="header-actions">
            <input
              aria-label="月结期间"
              type="month"
              value={periodInput}
              onChange={(event) => setPeriodInput(event.target.value)}
            />
            <button type="button" className="secondary-button" onClick={() => setSelectedPeriod(periodInput)}>
              选择期间
            </button>
            <button type="button" className="secondary-button" onClick={() => void handleRefresh()}>
              刷新
            </button>
            <button type="button" disabled={!canRunChecks || isRunning || !periodInput} onClick={() => void handleRunChecks()}>
              {isRunning ? "检查中" : "运行检查"}
            </button>
          </div>
        </div>
        {!canRunChecks ? <div className="notice warning">当前账号只能查看月结结果，不能运行检查或处理异常项。</div> : null}
        {notice ? <Notice tone="ok">{notice}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="month-close-workflow-band">
          <WorkflowStepper
            aria-label="月结流程"
            steps={workflow.steps.map((step) => ({
              id: step.id,
              label: step.label,
              description: step.description
            }))}
            currentStepId={workflow.currentStepId}
          />
          <div className="month-close-workflow-summary">
            <strong>{workflow.currentDescription}</strong>
            <span>{workflow.blockerCount > 0 ? `阻塞项 ${workflow.blockerCount} 个` : "当前无阻塞项"}</span>
          </div>
        </div>
      </section>

      <div className="month-close-grid">
        <MonthClosePeriodList
          periods={periods}
          selectedPeriod={selectedPeriod}
          isLoading={isLoadingPeriods}
          onSelect={(period) => {
            setSelectedPeriod(period);
            setPeriodInput(period);
          }}
        />
        <div className="month-close-main">
          <MonthCloseStatusBar period={selectedPeriodRow} overview={overview} workflow={workflow} />
          <section className="panel month-close-lock-panel" aria-label="锁账入口">
            <div className="panel-header">
              <div>
                <h2>锁账入口</h2>
                <p>锁账会生成当前期间的管理快照；如需重开期间，必须记录解锁原因。</p>
              </div>
              <div className="status-slot">{workflow.canLock ? "可锁账" : workflow.canUnlock ? "已锁账" : "等待闭环"}</div>
            </div>
            <div className="month-close-lock-grid">
              <label className="field">
                <span>锁账说明</span>
                <textarea
                  rows={3}
                  value={lockNote}
                  onChange={(event) => setLockNote(event.target.value)}
                  placeholder="例如：2026-04 已完成检查和对账确认"
                  disabled={!canRunChecks || !workflow.canLock || isLocking}
                />
              </label>
              <div className="month-close-lock-actions">
                <button
                  type="button"
                  disabled={!canRunChecks || !workflow.canLock || !lockNote.trim() || isLocking}
                  onClick={() => void handleLockPeriod()}
                >
                  {isLocking ? "锁账中" : "确认锁账"}
                </button>
                <span>{workflow.canLock ? "会生成新的月结快照版本。" : "完成检查处理后才能锁账。"}</span>
              </div>
            </div>
            {workflow.canUnlock && canUnlockPeriod ? (
              <div className="month-close-unlock-box">
                <label className="field">
                  <span>解锁原因</span>
                  <textarea
                    rows={2}
                    value={unlockReason}
                    onChange={(event) => setUnlockReason(event.target.value)}
                    placeholder="说明为什么需要重开期间"
                    disabled={isUnlocking}
                  />
                </label>
                <button
                  type="button"
                  className="danger-button"
                  disabled={!unlockReason.trim() || isUnlocking}
                  onClick={() => void handleUnlockPeriod()}
                >
                  {isUnlocking ? "解锁中" : "解锁期间"}
                </button>
              </div>
            ) : null}
          </section>
          {isLoadingOverview ? <div className="workspace-placeholder">读取检查结果中</div> : null}
          <MonthCloseSnapshotsTab snapshots={overview?.snapshots ?? []} isLoading={isLoadingOverview} />
          <MonthCloseReconciliationTabs reconciliation={reconciliation} isLoading={isLoadingReconciliation} />
          <MonthCloseChecksTab
            checks={overview?.checks ?? []}
            people={people}
            capabilities={capabilities}
            isUpdating={isUpdating}
            onUpdate={handleUpdateCheck}
          />
        </div>
      </div>
    </div>
  );
}

function blankPeriod(period: string): MonthClosePeriod | null {
  if (!period) return null;
  return {
    period,
    latest_run_id: null,
    latest_run_status: null,
    can_lock: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    locked_at: null,
    locked_by: null,
    snapshot_count: 0,
    latest_snapshot_version: null
  };
}

function currentPeriodValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
