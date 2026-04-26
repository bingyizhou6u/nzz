import type { MonthCloseSnapshot } from "./monthCloseTypes";

interface MonthCloseSnapshotsTabProps {
  snapshots: MonthCloseSnapshot[];
  isLoading: boolean;
}

export function MonthCloseSnapshotsTab({ snapshots, isLoading }: MonthCloseSnapshotsTabProps) {
  return (
    <section className="panel month-close-snapshots-panel">
      <div className="panel-header">
        <div>
          <h2>月结快照</h2>
        </div>
        <span className="month-close-muted-line">{snapshots.length} 个版本</span>
      </div>
      <div
        className="table-wrap month-close-snapshots-table-wrap"
        role="region"
        aria-label="月结快照表格，可横向滚动"
        tabIndex={0}
      >
        <table className="data-table month-close-snapshots-table">
          <thead>
            <tr>
              <th>版本</th>
              <th>锁账时间</th>
              <th>锁账人</th>
              <th>检查摘要</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length > 0 ? (
              snapshots.map((snapshot) => {
                const summary = snapshotSummary(snapshot.summary_json);
                return (
                  <tr key={snapshot.id}>
                    <td className="mono">v{snapshot.version}</td>
                    <td className="mono">{snapshot.locked_at}</td>
                    <td className="mono">{snapshot.locked_by}</td>
                    <td>
                      {summary.criticalCount}/{summary.warningCount}/{summary.infoCount}
                      <small className="month-close-muted-line">严重 / 警告 / 提示</small>
                    </td>
                    <td>{snapshot.note}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5}>{isLoading ? "读取快照中" : "暂无快照"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-scroll-hint">列较多时可横向滚动查看完整字段</div>
    </section>
  );
}

function snapshotSummary(summaryJson: string) {
  try {
    const parsed = JSON.parse(summaryJson) as Partial<Record<"criticalCount" | "warningCount" | "infoCount", unknown>>;
    return {
      criticalCount: typeof parsed.criticalCount === "number" ? parsed.criticalCount : 0,
      warningCount: typeof parsed.warningCount === "number" ? parsed.warningCount : 0,
      infoCount: typeof parsed.infoCount === "number" ? parsed.infoCount : 0
    };
  } catch {
    return { criticalCount: 0, warningCount: 0, infoCount: 0 };
  }
}
