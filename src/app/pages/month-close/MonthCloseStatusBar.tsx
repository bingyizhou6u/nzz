import { StatusTag } from "../../components/ui";
import { monthClosePeriodStatus } from "./monthCloseModel";
import type { MonthCloseOverview, MonthClosePeriod } from "./monthCloseTypes";

interface MonthCloseStatusBarProps {
  period: MonthClosePeriod | null;
  overview: MonthCloseOverview | null;
}

export function MonthCloseStatusBar({ period, overview }: MonthCloseStatusBarProps) {
  const status = period ? monthClosePeriodStatus(period) : null;
  const run = overview?.latestRun ?? null;

  return (
    <section className="month-close-status-bar" aria-label="月结状态">
      <div className="month-close-status-card">
        <span>当前期间</span>
        <strong className="mono">{period?.period ?? "-"}</strong>
        {status ? <StatusTag tone={status.tone}>{status.label}</StatusTag> : <StatusTag tone="muted">未选择</StatusTag>}
      </div>
      <div className="month-close-status-card">
        <span>检查结果</span>
        <strong>
          {period ? `${period.critical_count}/${period.warning_count}/${period.info_count}` : "0/0/0"}
        </strong>
        <small>严重 / 警告 / 提示</small>
      </div>
      <div className="month-close-status-card">
        <span>最近运行</span>
        <strong className="mono">{run?.finished_at ?? run?.started_at ?? "-"}</strong>
        <small>{run ? `由 ${run.started_by} 发起` : "尚未运行检查"}</small>
      </div>
      <div className="month-close-status-card">
        <span>锁账状态</span>
        <strong>{overview?.periodLock ? "已锁账" : period?.can_lock ? "可锁账" : "未锁账"}</strong>
        <small>{overview?.periodLock?.locked_at ?? "等待检查闭环"}</small>
      </div>
    </section>
  );
}
