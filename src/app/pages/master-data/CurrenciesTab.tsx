import { type FormEvent, useState } from "react";
import { FieldHint, FormActions, MessageLine, ReadOnlyNotice } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import { buildCurrencyPayload, isProtectedFieldDisabled } from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { CurrencyForm, CurrencyRow } from "./masterDataTypes";

const emptyForm: CurrencyForm = { code: "", name: "", minorUnits: "2", isEnabled: true };

function rowToForm(row: CurrencyRow): CurrencyForm {
  return {
    code: row.code,
    name: row.name,
    minorUnits: String(row.minor_units),
    isEnabled: Boolean(row.is_enabled)
  };
}

export function CurrenciesTab({
  rows,
  canWrite,
  onChanged
}: {
  rows: CurrencyRow[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<CurrencyForm>(emptyForm);
  const [editingRow, setEditingRow] = useState<CurrencyRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minorUnitsDisabled = isProtectedFieldDisabled(editingRow, "minorUnits");

  function resetForm() {
    setEditingRow(null);
    setForm(emptyForm);
  }

  async function save(nextForm: CurrencyForm, row: CurrencyRow | null) {
    const url = row ? `/api/master-data/currencies/${encodeURIComponent(row.code)}` : "/api/master-data/currencies";
    await writeMasterData(url, row ? "PATCH" : "POST", buildCurrencyPayload(nextForm));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改币种。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save(form, editingRow);
      setMessage(editingRow ? "已更新币种" : "已创建币种");
      resetForm();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存币种失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleEnabled(row: CurrencyRow) {
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改币种。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save({ ...rowToForm(row), isEnabled: !row.is_enabled }, row);
      setMessage(row.is_enabled ? "已停用币种" : "已启用币种");
      onChanged();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新币种状态失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="master-data-tab-panel">
      {canWrite ? (
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          币种代码
          <input
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            required
            disabled={Boolean(editingRow)}
          />
        </label>
        <label>
          名称
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          小数位
          <input
            type="number"
            min="0"
            max="6"
            value={form.minorUnits}
            onChange={(event) => setForm((current) => ({ ...current, minorUnits: event.target.value }))}
            required
            disabled={minorUnitsDisabled}
          />
        </label>
        <fieldset className="checkbox-group">
          <legend>状态</legend>
          <label>
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(event) => setForm((current) => ({ ...current, isEnabled: event.target.checked }))}
            />
            <span>启用</span>
          </label>
        </fieldset>
        <FormActions
          isSubmitting={isSubmitting}
          submitLabel={editingRow ? "保存币种" : "创建币种"}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      ) : (
        <ReadOnlyNotice />
      )}
      {canWrite && minorUnitsDisabled ? <FieldHint>已有引用，受保护字段不能修改。</FieldHint> : null}
      <MessageLine error={error} message={message} />
      <MasterDataTable
        rows={rows}
        getRowKey={(row) => row.code}
        emptyText="暂无币种"
        getSearchText={(row) => `${row.code} ${row.name}`}
        getStatus={(row) => (row.is_enabled ? "enabled" : "disabled")}
        statusLabels={{ enabled: "启用", disabled: "停用" }}
        columns={[
          { key: "code", header: "币种", render: (row) => <span className="mono">{row.code}</span> },
          { key: "name", header: "名称", render: (row) => row.name },
          { key: "minor", header: "小数位", render: (row) => row.minor_units },
          {
            key: "status",
            header: "状态",
            render: (row) => <span className={row.is_enabled ? "tag ok" : "tag muted"}>{row.is_enabled ? "启用" : "停用"}</span>
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
                <button type="button" className="secondary-button" onClick={() => void toggleEnabled(row)} disabled={isSubmitting}>
                  {row.is_enabled ? "停用" : "启用"}
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
