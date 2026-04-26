import { StatusTag } from "../../components/ui";
import { monthClosePeriodStatus } from "./monthCloseModel";
import type { MonthClosePeriod } from "./monthCloseTypes";

interface MonthClosePeriodListProps {
  periods: MonthClosePeriod[];
  selectedPeriod: string;
  isLoading: boolean;
  onSelect: (period: string) => void;
}

export function MonthClosePeriodList({ periods, selectedPeriod, isLoading, onSelect }: MonthClosePeriodListProps) {
  return (
    <section className="panel month-close-period-panel">
      <div className="panel-header">
        <h2>月结期间</h2>
        <div className="status-slot" role="status" aria-live="polite">
          {isLoading ? "读取中" : `${periods.length} 个期间`}
        </div>
      </div>
      <div className="month-close-period-list" role="list" aria-label="月结期间">
        {isLoading ? <div className="workspace-placeholder">读取期间中</div> : null}
        {!isLoading && periods.length === 0 ? <div className="workspace-placeholder">暂无期间数据</div> : null}
        {periods.map((period) => {
          const status = monthClosePeriodStatus(period);
          return (
            <button
              key={period.period}
              type="button"
              className={
                period.period === selectedPeriod
                  ? "month-close-period-item month-close-period-item-active"
                  : "month-close-period-item"
              }
              onClick={() => onSelect(period.period)}
              aria-current={period.period === selectedPeriod ? "true" : undefined}
            >
              <span className="mono">{period.period}</span>
              <StatusTag tone={status.tone}>{status.label}</StatusTag>
              <small>
                严重 {period.critical_count} / 警告 {period.warning_count} / 提示 {period.info_count}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
