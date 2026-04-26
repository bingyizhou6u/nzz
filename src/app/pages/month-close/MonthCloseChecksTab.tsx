import { useEffect, useMemo, useState } from "react";
import { DetailPanel, RecordList, SplitWorkspace, type RecordListItem } from "../../components/interaction";
import { EmptyState, StatusTag } from "../../components/ui";
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

type CheckListItem = RecordListItem & {
  check: MonthCloseCheckResult;
};

export function MonthCloseChecksTab({ checks, people, capabilities, isUpdating, onUpdate }: MonthCloseChecksTabProps) {
  const canHandle = canHandleMonthCloseChecks(capabilities);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(checks[0]?.id ?? null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (checks.length === 0) {
      setSelectedCheckId(null);
      return;
    }
    if (!selectedCheckId || !checks.some((check) => check.id === selectedCheckId)) {
      setSelectedCheckId(checks[0].id);
    }
  }, [checks, selectedCheckId]);

  const selectedCheck = useMemo(
    () => checks.find((check) => check.id === selectedCheckId) ?? checks[0] ?? null,
    [checks, selectedCheckId]
  );
  const listItems = useMemo<CheckListItem[]>(
    () =>
      checks.map((check) => ({
        id: check.id,
        title: checkTypeLabel(check.check_type),
        description: check.message,
        check
      })),
    [checks]
  );

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
      <SplitWorkspace
        className="month-close-check-workspace"
        list={
          <div className="month-close-check-list-region">
            <RecordList
              aria-label="月结检查项"
              items={listItems}
              selectedId={selectedCheck?.id ?? null}
              onSelect={(id) => setSelectedCheckId(id)}
              emptyState={<EmptyState title="暂无检查项" message="当前期间没有需要处理的检查结果" />}
              renderMeta={(item) => (
                <>
                  <span>{item.check.business_date ?? "无业务日期"}</span>
                  <span className="mono">{item.check.entity_id}</span>
                </>
              )}
              renderStatus={(item) => (
                <span className="month-close-check-list-status">
                  <StatusTag tone={severityTone(item.check.severity)}>{severityLabel(item.check.severity)}</StatusTag>
                  <StatusTag tone={statusTone(item.check.status)}>{monthCloseCheckStatusLabel(item.check.status)}</StatusTag>
                </span>
              )}
            />
          </div>
        }
        detail={
          selectedCheck ? (
            <DetailPanel
              title={checkTypeLabel(selectedCheck.check_type)}
              description={selectedCheck.message}
              status={<StatusTag tone={severityTone(selectedCheck.severity)}>{severityLabel(selectedCheck.severity)}</StatusTag>}
            >
              <div className="month-close-check-detail-grid">
                <div>
                  <span>对象</span>
                  <strong className="mono">{selectedCheck.entity_id}</strong>
                  <small>{selectedCheck.entity_type}</small>
                </div>
                <div>
                  <span>金额</span>
                  <strong className="mono">{formatMinorAmount(selectedCheck.amount_minor, selectedCheck.currency_code)}</strong>
                  <small>{selectedCheck.business_date ?? "无业务日期"}</small>
                </div>
                <div>
                  <span>USDT 成本</span>
                  <strong className="mono">{formatMinorAmount(selectedCheck.usdt_cost_minor, "USDT")}</strong>
                  <small>{selectedCheck.period}</small>
                </div>
                <div>
                  <span>状态</span>
                  <strong>{monthCloseCheckStatusLabel(selectedCheck.status)}</strong>
                  <small>{selectedCheck.resolved_at ?? "尚未完成处理"}</small>
                </div>
              </div>
              <div className="month-close-check-message-card">
                <span>{selectedCheck.suggested_action}</span>
                {selectedCheck.resolution_note ? <small>处理说明：{selectedCheck.resolution_note}</small> : null}
              </div>
              {canHandle ? (
                <div className="month-close-check-actions month-close-check-detail-actions">
                  <label className="field">
                    <span>责任人</span>
                    <select
                      aria-label={`${selectedCheck.id} 责任人`}
                      value={assignees[selectedCheck.id] ?? selectedCheck.assignee_person_id ?? ""}
                      onChange={(event) =>
                        setAssignees((current) => ({ ...current, [selectedCheck.id]: event.target.value }))
                      }
                      disabled={isUpdating}
                    >
                      <option value="">选择责任人</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.alias ? `${person.name} / ${person.alias}` : person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>处理说明</span>
                    <textarea
                      aria-label={`${selectedCheck.id} 处理说明`}
                      rows={3}
                      value={notes[selectedCheck.id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [selectedCheck.id]: event.target.value }))}
                      placeholder="填写确认依据、修正动作或保留原因"
                      disabled={isUpdating}
                    />
                  </label>
                  <div className="month-close-check-action-buttons">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isUpdating}
                      onClick={() => void applyAction(selectedCheck, "assign")}
                    >
                      分配
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isUpdating}
                      onClick={() => void applyAction(selectedCheck, "resolve")}
                    >
                      标记已处理
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isUpdating}
                      onClick={() => void applyAction(selectedCheck, "acknowledge")}
                    >
                      确认原因
                    </button>
                    {selectedCheck.severity !== "critical" ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isUpdating}
                        onClick={() => void applyAction(selectedCheck, "waive")}
                      >
                        确认保留
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <EmptyState title="只读模式" message="当前账号没有处理月结检查项的权限" />
              )}
            </DetailPanel>
          ) : (
            <DetailPanel title="检查详情" description="选择一条检查项后查看处理上下文">
              <EmptyState title="暂无检查项" message="当前期间没有需要处理的检查结果" />
            </DetailPanel>
          )
        }
      />
    </section>
  );
}
