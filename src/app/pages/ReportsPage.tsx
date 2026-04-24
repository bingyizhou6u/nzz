import { useEffect, useState } from "react";
import { getJson, type ApiEnvelope } from "../api";

interface AccountBalance {
  account_id: string;
  currency_code: string;
  balance_minor: number;
}

interface PettyCashPending {
  person_id: string;
  account_id: string;
  currency_code: string;
  remaining_amount_minor: number;
}

interface LoanBalance {
  borrower_person_id: string;
  currency_code: string;
  balance_minor: number;
}

interface ReportsState {
  accountBalances: AccountBalance[];
  pettyCashPending: PettyCashPending[];
  loanBalances: LoanBalance[];
}

const emptyReports: ReportsState = {
  accountBalances: [],
  pettyCashPending: [],
  loanBalances: []
};

function formatMinor(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function DataStateRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty-cell">
        {label}
      </td>
    </tr>
  );
}

export function ReportsPage() {
  const [reports, setReports] = useState<ReportsState>(emptyReports);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadReports() {
      setIsLoading(true);
      setError(null);
      try {
        const [accountBalances, pettyCashPending, loanBalances] = await Promise.all([
          getJson<ApiEnvelope<AccountBalance[]>>("/api/reports/account-balances"),
          getJson<ApiEnvelope<PettyCashPending[]>>("/api/reports/petty-cash-pending"),
          getJson<ApiEnvelope<LoanBalance[]>>("/api/reports/loan-balances")
        ]);

        if (isCurrent) {
          setReports({
            accountBalances: accountBalances.data,
            pettyCashPending: pettyCashPending.data,
            loanBalances: loanBalances.data
          });
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : "读取报表失败");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      isCurrent = false;
    };
  }, [reloadKey]);

  const rowLabel = isLoading ? "读取中" : error ? "读取失败" : "暂无数据";

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>报表</h2>
          <div className="header-actions">
            <div className="status-slot" role="status" aria-live="polite">
              {isLoading ? "读取中" : error ? "失败" : "已更新"}
            </div>
            <button type="button" className="secondary-button" onClick={() => setReloadKey((value) => value + 1)}>
              重新读取
            </button>
          </div>
        </div>

        {error ? <div className="notice error">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>账户余额</h2>
          <div className="status-slot">{reports.accountBalances.length} 条</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>账户ID</th>
                <th>币种</th>
                <th className="number-cell">余额(最小单位)</th>
              </tr>
            </thead>
            <tbody>
              {reports.accountBalances.length > 0 ? (
                reports.accountBalances.map((row) => (
                  <tr key={`${row.account_id}-${row.currency_code}`}>
                    <td className="mono">{row.account_id}</td>
                    <td className="mono">{row.currency_code}</td>
                    <td className="number-cell">{formatMinor(row.balance_minor)}</td>
                  </tr>
                ))
              ) : (
                <DataStateRow colSpan={3} label={rowLabel} />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>备用金待核销</h2>
          <div className="status-slot">{reports.pettyCashPending.length} 条</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>人员ID</th>
                <th>账户ID</th>
                <th>币种</th>
                <th className="number-cell">剩余金额(最小单位)</th>
              </tr>
            </thead>
            <tbody>
              {reports.pettyCashPending.length > 0 ? (
                reports.pettyCashPending.map((row) => (
                  <tr key={`${row.person_id}-${row.account_id}-${row.currency_code}`}>
                    <td className="mono">{row.person_id}</td>
                    <td className="mono">{row.account_id}</td>
                    <td className="mono">{row.currency_code}</td>
                    <td className="number-cell">{formatMinor(row.remaining_amount_minor)}</td>
                  </tr>
                ))
              ) : (
                <DataStateRow colSpan={4} label={rowLabel} />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>借款余额</h2>
          <div className="status-slot">{reports.loanBalances.length} 条</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>借款人ID</th>
                <th>币种</th>
                <th className="number-cell">余额(最小单位)</th>
              </tr>
            </thead>
            <tbody>
              {reports.loanBalances.length > 0 ? (
                reports.loanBalances.map((row) => (
                  <tr key={`${row.borrower_person_id}-${row.currency_code}`}>
                    <td className="mono">{row.borrower_person_id}</td>
                    <td className="mono">{row.currency_code}</td>
                    <td className="number-cell">{formatMinor(row.balance_minor)}</td>
                  </tr>
                ))
              ) : (
                <DataStateRow colSpan={3} label={rowLabel} />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
