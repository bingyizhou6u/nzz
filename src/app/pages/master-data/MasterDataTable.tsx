import { useMemo, useState, type ReactNode } from "react";

interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

interface MasterDataTableProps<Row> {
  rows: Row[];
  columns: Array<Column<Row>>;
  getRowKey: (row: Row) => string;
  emptyText: string;
  getSearchText?: (row: Row) => string;
  getStatus?: (row: Row) => string;
  statusLabels?: Record<string, string>;
  searchPlaceholder?: string;
  statusFilterLabel?: string;
}

export function MasterDataTable<Row>({
  rows,
  columns,
  getRowKey,
  emptyText,
  getSearchText,
  getStatus,
  statusLabels = {},
  searchPlaceholder = "输入关键字",
  statusFilterLabel = "状态"
}: MasterDataTableProps<Row>) {
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const statusOptions = useMemo(() => {
    if (!getStatus) return [];
    return Array.from(new Set(rows.map(getStatus))).filter(Boolean);
  }, [getStatus, rows]);
  const filteredRows = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && getStatus?.(row) !== statusFilter) return false;
      if (!normalizedSearchText || !getSearchText) return true;
      return getSearchText(row).toLowerCase().includes(normalizedSearchText);
    });
  }, [getSearchText, getStatus, rows, searchText, statusFilter]);

  return (
    <div className="master-data-table-section">
      {getSearchText || getStatus ? (
        <div className="master-data-table-tools">
          {getSearchText ? (
            <label>
              搜索
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>
          ) : null}
          {getStatus ? (
            <label>
              {statusFilterLabel}
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">全部</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status] ?? status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="table-wrap master-data-table-wrap">
        <table className="data-table master-data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="empty-cell" colSpan={columns.length}>
                  {rows.length > 0 ? "没有符合筛选条件的数据" : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
