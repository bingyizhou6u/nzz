import type { ReactNode } from "react";
import { classNames } from "../../components/ui";

export interface ReportColumn<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

export function ReportTable<T>({
  title,
  description,
  rows,
  rowKey,
  columns,
  emptyLabel,
  className
}: {
  title: string;
  description?: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: ReportColumn<T>[];
  emptyLabel: string;
  className?: string;
}) {
  return (
    <section className={classNames("panel report-panel", className)}>
      <div className="report-table-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <span>{rows.length} 行</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  <div className="report-table-empty">
                    <strong>{emptyLabel}</strong>
                    <span>当前表格暂无记录</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="report-table-scroll-hint">列较多时可横向滚动查看完整字段</div>
    </section>
  );
}
