import { type FormEvent, useState } from "react";
import { FieldHint, FormActions, MessageLine } from "./MasterDataForm";
import { MasterDataTable } from "./MasterDataTable";
import {
  buildCategoryPayload,
  categoryDirectionLabels,
  categoryDirections,
  categoryTypeLabels,
  categoryTypes,
  isProtectedFieldDisabled
} from "./masterDataModel";
import { writeMasterData } from "./masterDataRequests";
import type { CategoryForm, CategoryRow } from "./masterDataTypes";

const emptyForm: CategoryForm = {
  name: "",
  parentId: "",
  categoryType: "expense",
  direction: "out",
  affectsExpenseReport: true,
  affectsProjectReport: false,
  requiresMerchant: false,
  requiresPerson: false,
  requiresBorrower: false,
  isEnabled: true
};

function rowToForm(row: CategoryRow): CategoryForm {
  return {
    name: row.name,
    parentId: row.parent_id ?? "",
    categoryType: row.category_type,
    direction: row.direction,
    affectsExpenseReport: Boolean(row.affects_expense_report),
    affectsProjectReport: Boolean(row.affects_project_report),
    requiresMerchant: Boolean(row.requires_merchant),
    requiresPerson: Boolean(row.requires_person),
    requiresBorrower: Boolean(row.requires_borrower),
    isEnabled: Boolean(row.is_enabled)
  };
}

export function CategoriesTab({
  rows,
  currentActorId,
  onChanged
}: {
  rows: CategoryRow[];
  currentActorId: string;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [editingRow, setEditingRow] = useState<CategoryRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const protectedFields = [
    "categoryType",
    "direction",
    "affectsExpenseReport",
    "affectsProjectReport",
    "requiresMerchant",
    "requiresPerson",
    "requiresBorrower"
  ];
  const hasProtectedDisabled = protectedFields.some((field) => isProtectedFieldDisabled(editingRow, field));

  function resetForm() {
    setEditingRow(null);
    setForm(emptyForm);
  }

  async function save(nextForm: CategoryForm, row: CategoryRow | null) {
    const url = row ? `/api/master-data/categories/${encodeURIComponent(row.id)}` : "/api/master-data/categories";
    await writeMasterData(url, row ? "PATCH" : "POST", buildCategoryPayload(nextForm, currentActorId));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save(form, editingRow);
      setMessage(editingRow ? "已更新科目" : "已创建科目");
      resetForm();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存科目失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleEnabled(row: CategoryRow) {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await save({ ...rowToForm(row), isEnabled: !row.is_enabled }, row);
      setMessage(row.is_enabled ? "已停用科目" : "已启用科目");
      onChanged();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新科目状态失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="master-data-tab-panel">
      <form className="form-grid master-data-form" onSubmit={submit}>
        <label>
          科目名称
          <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </label>
        <label>
          父级科目
          <select value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}>
            <option value="">无</option>
            {rows
              .filter((category) => category.id !== editingRow?.id)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          类型
          <select
            value={form.categoryType}
            onChange={(event) => setForm((current) => ({ ...current, categoryType: event.target.value as CategoryForm["categoryType"] }))}
            disabled={isProtectedFieldDisabled(editingRow, "categoryType")}
          >
            {categoryTypes.map((categoryType) => (
              <option key={categoryType} value={categoryType}>
                {categoryTypeLabels[categoryType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          方向
          <select
            value={form.direction}
            onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value as CategoryForm["direction"] }))}
            disabled={isProtectedFieldDisabled(editingRow, "direction")}
          >
            {categoryDirections.map((direction) => (
              <option key={direction} value={direction}>
                {categoryDirectionLabels[direction]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="checkbox-group wide-field">
          <legend>影响与要求</legend>
          <label>
            <input
              type="checkbox"
              checked={form.affectsExpenseReport}
              onChange={(event) => setForm((current) => ({ ...current, affectsExpenseReport: event.target.checked }))}
              disabled={isProtectedFieldDisabled(editingRow, "affectsExpenseReport")}
            />
            <span>费用报表</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.affectsProjectReport}
              onChange={(event) => setForm((current) => ({ ...current, affectsProjectReport: event.target.checked }))}
              disabled={isProtectedFieldDisabled(editingRow, "affectsProjectReport")}
            />
            <span>项目报表</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.requiresMerchant}
              onChange={(event) => setForm((current) => ({ ...current, requiresMerchant: event.target.checked }))}
              disabled={isProtectedFieldDisabled(editingRow, "requiresMerchant")}
            />
            <span>需要商户</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.requiresPerson}
              onChange={(event) => setForm((current) => ({ ...current, requiresPerson: event.target.checked }))}
              disabled={isProtectedFieldDisabled(editingRow, "requiresPerson")}
            />
            <span>需要人员</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.requiresBorrower}
              onChange={(event) => setForm((current) => ({ ...current, requiresBorrower: event.target.checked }))}
              disabled={isProtectedFieldDisabled(editingRow, "requiresBorrower")}
            />
            <span>需要借款人</span>
          </label>
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
          submitLabel={editingRow ? "保存科目" : "创建科目"}
          submitDisabled={!currentActorId}
          onCancel={editingRow ? resetForm : undefined}
        />
      </form>
      {hasProtectedDisabled ? <FieldHint>已有引用，受保护字段不能修改。</FieldHint> : null}
      {!currentActorId ? <FieldHint>请选择当前操作人后再提交。</FieldHint> : null}
      <MessageLine error={error} message={message} />
      <MasterDataTable
        rows={rows}
        getRowKey={(row) => row.id}
        emptyText="暂无科目"
        getSearchText={(row) =>
          `${row.name} ${categoryTypeLabels[row.category_type]} ${categoryDirectionLabels[row.direction]}`
        }
        getStatus={(row) => (row.is_enabled ? "enabled" : "disabled")}
        statusLabels={{ enabled: "启用", disabled: "停用" }}
        columns={[
          { key: "name", header: "科目", render: (row) => row.name },
          { key: "type", header: "类型", render: (row) => categoryTypeLabels[row.category_type] },
          { key: "direction", header: "方向", render: (row) => categoryDirectionLabels[row.direction] },
          { key: "expense", header: "费用报表", render: (row) => (row.affects_expense_report ? "是" : "否") },
          { key: "project", header: "项目报表", render: (row) => (row.affects_project_report ? "是" : "否") },
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
                <button type="button" className="secondary-button" onClick={() => void toggleEnabled(row)} disabled={!currentActorId || isSubmitting}>
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
