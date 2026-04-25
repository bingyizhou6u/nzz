import type { ReactNode } from "react";

export interface ReportColumn<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

export function ReportTable<T>({
  title,
  rows,
  rowKey,
  columns,
  emptyLabel
}: {
  title: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: ReportColumn<T>[];
  emptyLabel: string;
}) {
  return (
    <section className="panel report-panel">
      <div className="report-table-header">
        <h2>{title}</h2>
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
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
