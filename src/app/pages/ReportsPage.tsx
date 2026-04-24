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

interface LotBalance {
  id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  current_account_id: string;
  current_person_id: string | null;
  lot_date: string;
  status?: string;
}

interface LotMovement {
  id: string;
  lot_id: string;
  document_id: string;
  movement_type: string;
  amount_minor: number;
  usdt_cost_minor: number;
  movement_date: string;
}

interface PendingCost {
  id: string;
  document_id: string;
  person_id: string;
  account_id: string;
  currency_code: string;
  remaining_amount_minor: number;
  expense_date: string;
  status: string;
}

interface ReportsState {
  accountBalances: AccountBalance[];
  pettyCashPending: PettyCashPending[];
  loanBalances: LoanBalance[];
  lotBalances: LotBalance[];
  lotMovements: LotMovement[];
  pendingCosts: PendingCost[];
}

const emptyReports: ReportsState = {
  accountBalances: [],
  pettyCashPending: [],
  loanBalances: [],
  lotBalances: [],
  lotMovements: [],
  pendingCosts: []
};

function formatMinor(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatOptional(value: string | null | undefined) {
  return value || "-";
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
        const [accountBalances, pettyCashPending, loanBalances, lotBalances, lotMovements, pendingCosts] =
          await Promise.all([
            getJson<ApiEnvelope<AccountBalance[]>>("/api/reports/account-balances"),
            getJson<ApiEnvelope<PettyCashPending[]>>("/api/reports/petty-cash-pending"),
            getJson<ApiEnvelope<LoanBalance[]>>("/api/reports/loan-balances"),
            getJson<ApiEnvelope<LotBalance[]>>("/api/reports/lots"),
            getJson<ApiEnvelope<LotMovement[]>>("/api/reports/lot-movements"),
            getJson<ApiEnvelope<PendingCost[]>>("/api/reports/pending-costs")
          ]);

        if (isCurrent) {
          setReports({
            accountBalances: accountBalances.data,
            pettyCashPending: pettyCashPending.data,
            loanBalances: loanBalances.data,
            lotBalances: lotBalances.data,
            lotMovements: lotMovements.data,
            pendingCosts: pendingCosts.data
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

      <section className="panel">
        <div className="panel-header">
          <h2>换汇批次 / 批次余额</h2>
          <div className="status-slot">{reports.lotBalances.length} 条</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>批次ID</th>
                <th>币种</th>
                <th>账户ID</th>
                <th>人员ID</th>
                <th>批次日期</th>
                <th className="number-cell">剩余金额</th>
                <th className="number-cell">剩余USDT成本</th>
              </tr>
            </thead>
            <tbody>
              {reports.lotBalances.length > 0 ? (
                reports.lotBalances.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.id}</td>
                    <td className="mono">{row.currency_code}</td>
                    <td className="mono">{row.current_account_id}</td>
                    <td className="mono">{formatOptional(row.current_person_id)}</td>
                    <td className="mono">{row.lot_date}</td>
                    <td className="number-cell">{formatMinor(row.remaining_amount_minor)}</td>
                    <td className="number-cell">{formatMinor(row.remaining_usdt_cost_minor)}</td>
                  </tr>
                ))
              ) : (
                <DataStateRow colSpan={7} label={rowLabel} />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>FIFO 消耗明细</h2>
          <div className="status-slot">{reports.lotMovements.length} 条</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>流水ID</th>
                <th>批次ID</th>
                <th>单据ID</th>
                <th>类型</th>
                <th>日期</th>
                <th className="number-cell">金额</th>
                <th className="number-cell">USDT成本</th>
              </tr>
            </thead>
            <tbody>
              {reports.lotMovements.length > 0 ? (
                reports.lotMovements.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.id}</td>
                    <td className="mono">{row.lot_id}</td>
                    <td className="mono">{row.document_id}</td>
                    <td className="mono">{row.movement_type}</td>
                    <td className="mono">{row.movement_date}</td>
                    <td className="number-cell">{formatMinor(row.amount_minor)}</td>
                    <td className="number-cell">{formatMinor(row.usdt_cost_minor)}</td>
                  </tr>
                ))
              ) : (
                <DataStateRow colSpan={7} label={rowLabel} />
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>待匹配成本</h2>
          <div className="status-slot">{reports.pendingCosts.length} 条</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>记录ID</th>
                <th>单据ID</th>
                <th>人员ID</th>
                <th>账户ID</th>
                <th>币种</th>
                <th>费用日期</th>
                <th>状态</th>
                <th className="number-cell">剩余金额</th>
              </tr>
            </thead>
            <tbody>
              {reports.pendingCosts.length > 0 ? (
                reports.pendingCosts.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.id}</td>
                    <td className="mono">{row.document_id}</td>
                    <td className="mono">{row.person_id}</td>
                    <td className="mono">{row.account_id}</td>
                    <td className="mono">{row.currency_code}</td>
                    <td className="mono">{row.expense_date}</td>
                    <td className="mono">{row.status}</td>
                    <td className="number-cell">{formatMinor(row.remaining_amount_minor)}</td>
                  </tr>
                ))
              ) : (
                <DataStateRow colSpan={8} label={rowLabel} />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
