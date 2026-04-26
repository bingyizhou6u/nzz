import { useState } from "react";
import { StatusTag } from "../../components/ui";
import {
  buildCheckActionPatch,
  canHandleMonthCloseChecks,
  checkTypeLabel,
  formatMinorAmount,
  monthCloseCheckStatusLabel,
  severityLabel,
  severityTone,
  statusTone,
  type MonthCloseCheckAction
} from "./monthCloseModel";
import type { MonthCloseCheckPatch, MonthCloseCheckResult, PersonOption } from "./monthCloseTypes";

interface MonthCloseChecksTabProps {
  checks: MonthCloseCheckResult[];
  people: PersonOption[];
  capabilities: string[];
  isUpdating: boolean;
  onUpdate: (id: string, patch: MonthCloseCheckPatch) => Promise<void>;
}

export function MonthCloseChecksTab({ checks, people, capabilities, isUpdating, onUpdate }: MonthCloseChecksTabProps) {
  const canHandle = canHandleMonthCloseChecks(capabilities);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  async function applyAction(check: MonthCloseCheckResult, action: MonthCloseCheckAction) {
    setLocalError(null);
    try {
      const patch = buildCheckActionPatch(check, action, {
        note: notes[check.id] ?? "",
        assigneePersonId: assignees[check.id] ?? check.assignee_person_id ?? ""
      });
      await onUpdate(check.id, patch);
      if (action !== "assign") {
        setNotes((current) => ({ ...current, [check.id]: "" }));
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "更新检查项失败");
    }
  }

  return (
    <section className="panel month-close-checks-panel">
      <div className="panel-header">
        <h2>检查清单</h2>
        <div className="status-slot">{checks.length} 项</div>
      </div>
      {localError ? <div className="notice error">{localError}</div> : null}
      <div className="table-wrap">
        <table className="data-table month-close-check-table">
          <thead>
            <tr>
              <th>级别</th>
              <th>检查项</th>
              <th>对象</th>
              <th>金额</th>
              <th>说明</th>
              <th>状态</th>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            {checks.length > 0 ? (
              checks.map((check) => (
                <tr key={check.id}>
                  <td>
                    <StatusTag tone={severityTone(check.severity)}>{severityLabel(check.severity)}</StatusTag>
                  </td>
                  <td>
                    <strong>{checkTypeLabel(check.check_type)}</strong>
                    <small className="month-close-muted-line">{check.business_date ?? "-"}</small>
                  </td>
                  <td>
                    <span className="mono">{check.entity_id}</span>
                    <small className="month-close-muted-line">{check.entity_type}</small>
                  </td>
                  <td className="mono">{formatMinorAmount(check.amount_minor, check.currency_code)}</td>
                  <td>
                    <div className="month-close-message">
                      <span>{check.message}</span>
                      <small>{check.suggested_action}</small>
                      {check.resolution_note ? <small>处理说明：{check.resolution_note}</small> : null}
                    </div>
                  </td>
                  <td>
                    <StatusTag tone={statusTone(check.status)}>{monthCloseCheckStatusLabel(check.status)}</StatusTag>
                  </td>
                  <td>
                    {canHandle ? (
                      <div className="month-close-check-actions">
                        <select
                          aria-label={`${check.id} 责任人`}
                          value={assignees[check.id] ?? check.assignee_person_id ?? ""}
                          onChange={(event) => setAssignees((current) => ({ ...current, [check.id]: event.target.value }))}
                          disabled={isUpdating}
                        >
                          <option value="">选择责任人</option>
                          {people.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.alias ? `${person.name} / ${person.alias}` : person.name}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${check.id} 处理说明`}
                          value={notes[check.id] ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [check.id]: event.target.value }))}
                          placeholder="处理说明"
                          disabled={isUpdating}
                        />
                        <div className="month-close-check-action-buttons">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isUpdating}
                            onClick={() => void applyAction(check, "assign")}
                          >
                            分配
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isUpdating}
                            onClick={() => void applyAction(check, "resolve")}
                          >
                            标记已处理
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isUpdating}
                            onClick={() => void applyAction(check, "acknowledge")}
                          >
                            确认原因
                          </button>
                          {check.severity !== "critical" ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={isUpdating}
                              onClick={() => void applyAction(check, "waive")}
                            >
                              确认保留
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <span className="month-close-muted-line">只读</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="empty-cell">
                  暂无检查项
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
