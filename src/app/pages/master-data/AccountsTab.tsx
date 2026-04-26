import { type FormEvent, useState } from "react";
import { FieldHint, FormActions, MessageLine, ReadOnlyNotice } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import {
  accountTypeLabels,
  accountTypes,
  activeStatusLabels,
  buildAccountPayload,
  isDemoRecord,
  isProtectedFieldDisabled
} from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { AccountForm, AccountRow, CurrencyRow, PersonRow } from "./masterDataTypes";

const emptyForm: AccountForm = {
  name: "",
  accountType: "currency_reserve",
  currencyCode: "",
  ownerPersonId: "",
  isCompanyAccount: true,
  allowNegative: false,
  status: "active"
};

function rowToForm(row: AccountRow): AccountForm {
  return {
    name: row.name,
    accountType: row.account_type,
    currencyCode: row.currency_code,
    ownerPersonId: row.owner_person_id ?? "",
    isCompanyAccount: Boolean(row.is_company_account),
    allowNegative: Boolean(row.allow_negative),
    status: row.status
  };
}

function personName(people: PersonRow[], personId: string | null) {
  if (!personId) return "无";
  return people.find((person) => person.id === personId)?.name ?? personId;
}

export function AccountsTab({
  rows,
  people,
  currencies,
  canWrite,
  onChanged
}: {
  rows: AccountRow[];
  people: PersonRow[];
  currencies: CurrencyRow[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [editingRow, setEditingRow] = useState<AccountRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const protectedField = ["accountType", "currencyCode", "ownerPersonId", "isCompanyAccount"].some((field) =>
    isProtectedFieldDisabled(editingRow, field)
  );

  function resetForm() {
    setEditingRow(null);
    setForm(emptyForm);
  }

  async function save(nextForm: AccountForm, row: AccountRow | null) {
    const url = row ? `/api/master-data/accounts/${encodeURIComponent(row.id)}` : "/api/master-data/accounts";
    await writeMasterData(url, row ? "PATCH" : "POST", buildAccountPayload(nextForm));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改账户。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save(form, editingRow);
      setMessage(editingRow ? "已更新账户" : "已创建账户");
      resetForm();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存账户失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleArchive(row: AccountRow) {
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改账户。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save({ ...rowToForm(row), status: row.status === "active" ? "archived" : "active" }, row);
      setMessage(row.status === "active" ? "已归档账户" : "已恢复账户");
      onChanged();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新账户状态失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="master-data-tab-panel">
      {canWrite ? (
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          账户名称
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          账户类型
          <select
            value={form.accountType}
            onChange={(event) => setForm((current) => ({ ...current, accountType: event.target.value as AccountForm["accountType"] }))}
            disabled={isProtectedFieldDisabled(editingRow, "accountType")}
          >
            {accountTypes.map((accountType) => (
              <option key={accountType} value={accountType}>
                {accountTypeLabels[accountType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          币种
          <select
            value={form.currencyCode}
            onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value }))}
            required
            disabled={isProtectedFieldDisabled(editingRow, "currencyCode")}
          >
            <option value="">请选择币种</option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} / {currency.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          所属人员
          <select
            value={form.ownerPersonId}
            onChange={(event) => setForm((current) => ({ ...current, ownerPersonId: event.target.value }))}
            disabled={isProtectedFieldDisabled(editingRow, "ownerPersonId")}
          >
            <option value="">无</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AccountForm["status"] }))}>
            <option value="active">启用</option>
            <option value="archived">归档</option>
          </select>
        </label>
        <fieldset className="checkbox-group wide-field">
          <legend>账户属性</legend>
          <label>
            <input
              type="checkbox"
              checked={form.isCompanyAccount}
              onChange={(event) => setForm((current) => ({ ...current, isCompanyAccount: event.target.checked }))}
              disabled={isProtectedFieldDisabled(editingRow, "isCompanyAccount")}
            />
            <span>公司账户</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowNegative}
              onChange={(event) => setForm((current) => ({ ...current, allowNegative: event.target.checked }))}
            />
            <span>允许负数</span>
          </label>
        </fieldset>
        <FormActions
          isSubmitting={isSubmitting}
          submitLabel={editingRow ? "保存账户" : "创建账户"}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      ) : (
        <ReadOnlyNotice />
      )}
      {canWrite ? <FieldHint>真实账户请新建账户资料，不要把 demo_* 演示账户用于正式换汇、备用金或报销。</FieldHint> : null}
      {canWrite && protectedField ? <FieldHint>已有引用，受保护字段不能修改。</FieldHint> : null}
      <MessageLine error={error} message={message} />
      <MasterDataTable
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="暂无账户"
        getSearchText={(row) =>
          `${row.name} ${accountTypeLabels[row.account_type]} ${row.currency_code} ${personName(people, row.owner_person_id)}`
        }
        getStatus={(row) => row.status}
        statusLabels={activeStatusLabels}
        searchPlaceholder="搜索账户、币种、所属人员"
        statusFilterLabel="启用状态"
        columns={[
          { key: "kind", header: "资料", render: (row) => <DemoTag row={row} /> },
          { key: "name", header: "账户", render: (row) => row.name },
          { key: "type", header: "类型", render: (row) => accountTypeLabels[row.account_type] },
          { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
          { key: "owner", header: "所属人员", render: (row) => personName(people, row.owner_person_id) },
          { key: "negative", header: "允许负数", render: (row) => (row.allow_negative ? "是" : "否") },
          {
            key: "status",
            header: "状态",
            render: (row) => <span className={row.status === "active" ? "tag ok" : "tag muted"}>{activeStatusLabels[row.status]}</span>
          },
          { key: "refs", header: "引用", render: (row) => row.referenceCount },
          {
            key: "actions",
            header: "操作",
            render: (row) => canWrite ? (
              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => { setEditingRow(row); setForm(rowToForm(row)); }}>
                  编辑
                </button>
                <button type="button" className="secondary-button" onClick={() => void toggleArchive(row)} disabled={isSubmitting}>
                  {row.status === "active" ? "归档" : "恢复"}
                </button>
              </div>
            ) : (
              <span>无</span>
            )
          }
        ]}
      />
    </div>
  );
}

function DemoTag({ row }: { row: AccountRow }) {
  return isDemoRecord(row) ? (
    <span className="tag warning master-data-demo-tag">演示</span>
  ) : (
    <span className="tag ok">真实</span>
  );
}
