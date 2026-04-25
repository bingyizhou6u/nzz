import { type FormEvent, useState } from "react";
import { FieldHint, FormActions, MessageLine, ReadOnlyNotice } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import { activeStatusLabels, buildMerchantPayload, isProtectedFieldDisabled } from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { MerchantForm, MerchantRow, PersonRow, ProjectRow } from "./masterDataTypes";

const emptyForm: MerchantForm = {
  code: "",
  name: "",
  projectId: "",
  merchantType: "",
  launchDate: "",
  status: "active",
  ownerPersonId: "",
  note: ""
};

function rowToForm(row: MerchantRow): MerchantForm {
  return {
    code: row.code,
    name: row.name,
    projectId: row.project_id,
    merchantType: row.merchant_type ?? "",
    launchDate: row.launch_date ?? "",
    status: row.status,
    ownerPersonId: row.owner_person_id ?? "",
    note: row.note ?? ""
  };
}

function labelById<T extends { id: string; name: string }>(rows: T[], id: string | null) {
  if (!id) return "无";
  return rows.find((row) => row.id === id)?.name ?? id;
}

export function MerchantsTab({
  rows,
  people,
  projects,
  canWrite,
  onChanged
}: {
  rows: MerchantRow[];
  people: PersonRow[];
  projects: ProjectRow[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<MerchantForm>(emptyForm);
  const [editingRow, setEditingRow] = useState<MerchantRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectDisabled = isProtectedFieldDisabled(editingRow, "projectId");

  function resetForm() {
    setEditingRow(null);
    setForm(emptyForm);
  }

  async function save(nextForm: MerchantForm, row: MerchantRow | null) {
    const url = row ? `/api/master-data/merchants/${encodeURIComponent(row.id)}` : "/api/master-data/merchants";
    await writeMasterData(url, row ? "PATCH" : "POST", buildMerchantPayload(nextForm));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改商户。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save(form, editingRow);
      setMessage(editingRow ? "已更新商户" : "已创建商户");
      resetForm();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存商户失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleArchive(row: MerchantRow) {
    if (!canWrite) {
      setError("当前账号只能查看基础资料，不能修改商户。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save({ ...rowToForm(row), status: row.status === "active" ? "archived" : "active" }, row);
      setMessage(row.status === "active" ? "已归档商户" : "已恢复商户");
      onChanged();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新商户状态失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="master-data-tab-panel">
      {canWrite ? (
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          商户编码
          <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} required />
        </label>
        <label>
          商户名称
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          所属项目
          <select
            value={form.projectId}
            onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}
            required
            disabled={projectDisabled}
          >
            <option value="">请选择项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} / {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          负责人
          <select value={form.ownerPersonId} onChange={(event) => setForm((current) => ({ ...current, ownerPersonId: event.target.value }))}>
            <option value="">无</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          商户类型
          <input value={form.merchantType} onChange={(event) => setForm((current) => ({ ...current, merchantType: event.target.value }))} />
        </label>
        <label>
          上线日期
          <input type="date" value={form.launchDate} onChange={(event) => setForm((current) => ({ ...current, launchDate: event.target.value }))} />
        </label>
        <label>
          状态
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as MerchantForm["status"] }))}>
            <option value="active">启用</option>
            <option value="archived">归档</option>
          </select>
        </label>
        <label>
          备注
          <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <FormActions
          isSubmitting={isSubmitting}
          submitLabel={editingRow ? "保存商户" : "创建商户"}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      ) : (
        <ReadOnlyNotice />
      )}
      {canWrite && projectDisabled ? <FieldHint>已有引用，受保护字段不能修改。</FieldHint> : null}
      <MessageLine error={error} message={message} />
      <MasterDataTable
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="暂无商户"
        getSearchText={(row) =>
          `${row.code} ${row.name} ${labelById(projects, row.project_id)} ${labelById(people, row.owner_person_id)} ${
            row.merchant_type ?? ""
          } ${row.note ?? ""}`
        }
        getStatus={(row) => row.status}
        statusLabels={activeStatusLabels}
        columns={[
          { key: "code", header: "商户编码", render: (row) => <span className="mono">{row.code}</span> },
          { key: "name", header: "商户名称", render: (row) => row.name },
          { key: "project", header: "所属项目", render: (row) => labelById(projects, row.project_id) },
          { key: "type", header: "商户类型", render: (row) => row.merchant_type || "无" },
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
