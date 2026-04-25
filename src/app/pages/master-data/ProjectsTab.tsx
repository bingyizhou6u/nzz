import { type FormEvent, useState } from "react";
import { FieldHint, FormActions, MessageLine } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import { activeStatusLabels, buildProjectPayload } from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { PersonRow, ProjectForm, ProjectRow } from "./masterDataTypes";

const emptyForm: ProjectForm = { code: "", name: "", ownerPersonId: "", status: "active", note: "" };

function rowToForm(row: ProjectRow): ProjectForm {
  return {
    code: row.code,
    name: row.name,
    ownerPersonId: row.owner_person_id ?? "",
    status: row.status,
    note: row.note ?? ""
  };
}

function personName(people: PersonRow[], personId: string | null) {
  if (!personId) return "无";
  return people.find((person) => person.id === personId)?.name ?? personId;
}

export function ProjectsTab({
  rows,
  people,
  currentActorId,
  onChanged
}: {
  rows: ProjectRow[];
  people: PersonRow[];
  currentActorId: string;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [editingRow, setEditingRow] = useState<ProjectRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setEditingRow(null);
    setForm(emptyForm);
  }

  async function save(nextForm: ProjectForm, row: ProjectRow | null) {
    const url = row ? `/api/master-data/projects/${encodeURIComponent(row.id)}` : "/api/master-data/projects";
    await writeMasterData(url, row ? "PATCH" : "POST", buildProjectPayload(nextForm, currentActorId));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save(form, editingRow);
      setMessage(editingRow ? "已更新项目" : "已创建项目");
      resetForm();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存项目失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleArchive(row: ProjectRow) {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save({ ...rowToForm(row), status: row.status === "active" ? "archived" : "active" }, row);
      setMessage(row.status === "active" ? "已归档项目" : "已恢复项目");
      onChanged();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新项目状态失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="master-data-tab-panel">
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          项目编码
          <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} required />
        </label>
        <label>
          项目名称
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          负责人
          <select
            value={form.ownerPersonId}
            onChange={(event) => setForm((current) => ({ ...current, ownerPersonId: event.target.value }))}
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
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProjectForm["status"] }))}>
            <option value="active">启用</option>
            <option value="archived">归档</option>
          </select>
        </label>
        <label className="wide-field">
          备注
          <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <FormActions
          isSubmitting={isSubmitting}
          submitLabel={editingRow ? "保存项目" : "创建项目"}
          submitDisabled={!currentActorId}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      {!currentActorId ? <FieldHint>请选择当前操作人后再提交。</FieldHint> : null}
      <MessageLine error={error} message={message} />
      <MasterDataTable
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="暂无项目"
        getSearchText={(row) => `${row.code} ${row.name} ${personName(people, row.owner_person_id)} ${row.note ?? ""}`}
        getStatus={(row) => row.status}
        statusLabels={activeStatusLabels}
        columns={[
          { key: "code", header: "项目编码", render: (row) => <span className="mono">{row.code}</span> },
          { key: "name", header: "项目名称", render: (row) => row.name },
          { key: "owner", header: "负责人", render: (row) => personName(people, row.owner_person_id) },
          {
            key: "status",
            header: "状态",
            render: (row) => <span className={row.status === "active" ? "tag ok" : "tag muted"}>{activeStatusLabels[row.status]}</span>
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
                <button type="button" className="secondary-button" onClick={() => void toggleArchive(row)} disabled={!currentActorId || isSubmitting}>
                  {row.status === "active" ? "归档" : "恢复"}
                </button>
              </div>
            )
          }
        ]}
      />
    </div>
  );
}
