import { type FormEvent, useState } from "react";
import { FieldHint, FormActions, MessageLine, ReadOnlyNotice } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import {
  buildPersonPayload,
  parseRoles,
  personFormWithPermittedIdentity,
  personLoginStatus,
  personRoleLabels,
  personRoles
} from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { PersonForm, PersonRole, PersonRow } from "./masterDataTypes";

const emptyForm: PersonForm = { name: "", alias: "", roles: ["finance_entry"], loginEmail: "", isEnabled: true };

function rowToForm(row: PersonRow): PersonForm {
  return {
    name: row.name,
    alias: row.alias ?? "",
    roles: parseRoles(row.roles_json),
    loginEmail: row.login_email ?? "",
    isEnabled: Boolean(row.is_enabled)
  };
}

export function PeopleTab({
  rows,
  canWrite,
  canManagePeopleRoles,
  onChanged
}: {
  rows: PersonRow[];
  canWrite: boolean;
  canManagePeopleRoles: boolean;
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
    if (!canManagePeopleRoles) return;
    setForm((current) => ({
      ...current,
      roles: checked ? [...current.roles, role] : current.roles.filter((currentRole) => currentRole !== role)
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改人员。");
      return;
    }
    if (!canManagePeopleRoles && !editingRow) {
      setError("创建人员需要人员角色管理权限。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const url = editingRow
        ? `/api/master-data/people/${encodeURIComponent(editingRow.id)}`
        : "/api/master-data/people";
      const existingIdentity = editingRow
        ? {
            roles: parseRoles(editingRow.roles_json),
            loginEmail: editingRow.login_email ?? "",
            isEnabled: Boolean(editingRow.is_enabled)
          }
        : null;
      await writeMasterData(
        url,
        editingRow ? "PATCH" : "POST",
        buildPersonPayload(personFormWithPermittedIdentity(form, existingIdentity, canManagePeopleRoles))
      );
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
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改人员。");
      return;
    }
    if (!canManagePeopleRoles) {
      setError("启用或停用人员需要人员角色管理权限。");
      return;
    }

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
      {canWrite ? (
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          姓名
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          别名
          <input value={form.alias} onChange={(event) => setForm((current) => ({ ...current, alias: event.target.value }))} />
        </label>
        <fieldset className="person-identity-section wide-field">
          <legend>登录身份</legend>
          <label>
            登录邮箱
            <input
              value={form.loginEmail}
              onChange={(event) => setForm((current) => ({ ...current, loginEmail: event.target.value }))}
              disabled={!canManagePeopleRoles}
            />
          </label>
          <label>
            状态
            <select
              value={form.isEnabled ? "enabled" : "disabled"}
              onChange={(event) => setForm((current) => ({ ...current, isEnabled: event.target.value === "enabled" }))}
              disabled={!canManagePeopleRoles}
            >
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
          <fieldset className="checkbox-group person-role-options">
            <legend className="person-role-options-legend">角色</legend>
            {personRoles.map((role) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={form.roles.includes(role)}
                  onChange={(event) => toggleRole(role, event.target.checked)}
                  disabled={!canManagePeopleRoles}
                />
                <span>{personRoleLabels[role]}</span>
              </label>
            ))}
          </fieldset>
        </fieldset>
        <FormActions
          isSubmitting={isSubmitting}
          submitLabel={editingRow ? "保存人员" : "创建人员"}
          submitDisabled={!canManagePeopleRoles && !editingRow}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      ) : (
        <ReadOnlyNotice />
      )}
      {canWrite && !canManagePeopleRoles ? (
        <FieldHint>{editingRow ? "角色、登录邮箱和状态仅可查看，保存时会保留原值。" : "创建人员需要人员角色管理权限。"}</FieldHint>
      ) : null}
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
            key: "loginEmail",
            header: "登录邮箱",
            render: (row) => row.login_email || "未绑定"
          },
          {
            key: "loginStatus",
            header: "登录状态",
            render: (row) => {
              const status = personLoginStatus(row);
              return <span className={`tag ${status.tone}`}>{status.label}</span>;
            }
          },
          {
            key: "lastLogin",
            header: "最近登录",
            render: (row) => row.last_login_at || "无"
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
            render: (row) => canWrite ? (
              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => { setEditingRow(row); setForm(rowToForm(row)); }}>
                  编辑
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void toggleStatus(row)}
                  disabled={isSubmitting || !canManagePeopleRoles}
                >
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
