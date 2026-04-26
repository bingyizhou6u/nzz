import { useEffect, useMemo, useState } from "react";
import { Notice } from "../components/ui";
import {
  getMonthCloseOverview,
  listMonthClosePeriods,
  listPeopleOptions,
  runMonthCloseChecks,
  updateMonthCloseCheckResult
} from "./month-close/monthCloseApi";
import { MonthCloseChecksTab } from "./month-close/MonthCloseChecksTab";
import { MonthClosePeriodList } from "./month-close/MonthClosePeriodList";
import { MonthCloseStatusBar } from "./month-close/MonthCloseStatusBar";
import { canRunMonthCloseChecks } from "./month-close/monthCloseModel";
import type {
  MonthCloseCheckPatch,
  MonthCloseOverview,
  MonthClosePeriod,
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
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRunChecks = canRunMonthCloseChecks(capabilities);

  const selectedPeriodRow = useMemo(
    () => periods.find((period) => period.period === selectedPeriod) ?? blankPeriod(selectedPeriod),
    [periods, selectedPeriod]
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
      return;
    }

    let isCurrent = true;

    async function loadOverview() {
      setIsLoadingOverview(true);
      setError(null);
      try {
        const nextOverview = await getMonthCloseOverview(selectedPeriod);
        if (isCurrent) setOverview(nextOverview);
      } catch (loadError) {
        if (isCurrent) setError(errorMessage(loadError, "读取月结检查结果失败"));
      } finally {
        if (isCurrent) setIsLoadingOverview(false);
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
    const nextOverview = await getMonthCloseOverview(period);
    setOverview(nextOverview);
  }

  async function handleRefresh() {
    setNotice(null);
    setError(null);
    setIsLoadingPeriods(true);
    setIsLoadingOverview(Boolean(selectedPeriod));
    try {
      await refreshPeriods();
      await refreshSelectedOverview();
      setNotice("已刷新月结中心数据。");
    } catch (refreshError) {
      setError(errorMessage(refreshError, "刷新月结中心失败"));
    } finally {
      setIsLoadingPeriods(false);
      setIsLoadingOverview(false);
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
    } catch (updateError) {
      setError(errorMessage(updateError, "更新检查项失败"));
      throw updateError;
    } finally {
      setIsUpdating(false);
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
          <MonthCloseStatusBar period={selectedPeriodRow} overview={overview} />
          {isLoadingOverview ? <div className="workspace-placeholder">读取检查结果中</div> : null}
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
