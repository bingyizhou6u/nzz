import { type FormEvent, useState } from "react";
import { FormActions, MessageLine } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import { buildPersonPayload, parseRoles, personRoleLabels, personRoles } from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { PersonForm, PersonRole, PersonRow } from "./masterDataTypes";

const emptyForm: PersonForm = { name: "", alias: "", roles: ["finance_entry"], isEnabled: true };

function rowToForm(row: PersonRow): PersonForm {
  return {
    name: row.name,
    alias: row.alias ?? "",
    roles: parseRoles(row.roles_json),
    isEnabled: Boolean(row.is_enabled)
  };
}

export function PeopleTab({
  rows,
  onChanged
}: {
  rows: PersonRow[];
  onChanged: () => void;
}) {
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const [editingRow, setEditingRow] = useState<PersonRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setEditingRow(null);
    setForm(emptyForm);
  }

  function toggleRole(role: PersonRole, checked: boolean) {
    setForm((current) => ({
      ...current,
      roles: checked ? [...current.roles, role] : current.roles.filter((currentRole) => currentRole !== role)
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const url = editingRow
        ? `/api/master-data/people/${encodeURIComponent(editingRow.id)}`
        : "/api/master-data/people";
      await writeMasterData(url, editingRow ? "PATCH" : "POST", buildPersonPayload(form));
      setMessage(editingRow ? "已更新人员" : "已创建人员");
      resetForm();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存人员失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleStatus(row: PersonRow) {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await writeMasterData(
        `/api/master-data/people/${encodeURIComponent(row.id)}`,
        "PATCH",
        buildPersonPayload({ ...rowToForm(row), isEnabled: !row.is_enabled })
      );
      setMessage(row.is_enabled ? "已停用人员" : "已启用人员");
      onChanged();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新人员状态失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="master-data-tab-panel">
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          姓名
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          别名
          <input value={form.alias} onChange={(event) => setForm((current) => ({ ...current, alias: event.target.value }))} />
        </label>
        <label>
          状态
          <select
            value={form.isEnabled ? "enabled" : "disabled"}
            onChange={(event) => setForm((current) => ({ ...current, isEnabled: event.target.value === "enabled" }))}
          >
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <fieldset className="checkbox-group wide-field">
          <legend>角色</legend>
          {personRoles.map((role) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={form.roles.includes(role)}
                onChange={(event) => toggleRole(role, event.target.checked)}
              />
              <span>{personRoleLabels[role]}</span>
            </label>
          ))}
        </fieldset>
        <FormActions
          isSubmitting={isSubmitting}
          submitLabel={editingRow ? "保存人员" : "创建人员"}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      <MessageLine error={error} message={message} />
      <MasterDataTable
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="暂无人员"
        getSearchText={(row) => `${row.name} ${row.alias ?? ""} ${parseRoles(row.roles_json).join(" ")}`}
        getStatus={(row) => (row.is_enabled ? "enabled" : "disabled")}
        statusLabels={{ enabled: "启用", disabled: "停用" }}
        columns={[
          { key: "name", header: "姓名", render: (row) => row.name },
          { key: "alias", header: "别名", render: (row) => row.alias || "无" },
          {
            key: "roles",
            header: "角色",
            render: (row) => parseRoles(row.roles_json).map((role) => personRoleLabels[role]).join("、") || "无"
          },
          {
            key: "status",
            header: "状态",
            render: (row) => <span className={row.is_enabled ? "tag ok" : "tag muted"}>{row.is_enabled ? "启用" : "停用"}</span>
          },
          { key: "refs", header: "引用", render: (row) => row.referenceCount },
          {
            key: "actions",
            header: "操作",
            render: (row) => (
              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => { setEditingRow(row); setForm(rowToForm(row)); }}>
                  编辑
                </button>
                <button type="button" className="secondary-button" onClick={() => void toggleStatus(row)} disabled={isSubmitting}>
                  {row.is_enabled ? "停用" : "启用"}
                </button>
              </div>
            )
          }
        ]}
      />
    </div>
  );
}
