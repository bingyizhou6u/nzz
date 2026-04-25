import { useEffect, useState } from "react";
import { listPeriodLocks, lockPeriod, unlockPeriod } from "./period-locks/periodLockApi";
import type { PeriodLockRow } from "./period-locks/periodLockTypes";

type LoadState = "loading" | "ready" | "error";
type ActionKey = "lock" | `unlock:${string}` | null;

interface PeriodLocksPageProps {
  capabilities: string[];
}

export function canLockPeriod(capabilities: string[]) {
  return capabilities.includes("periodLocks.lock");
}

export function canUnlockPeriod(capabilities: string[]) {
  return capabilities.includes("periodLocks.unlock");
}

export function PeriodLocksPage({ capabilities }: PeriodLocksPageProps) {
  const [locks, setLocks] = useState<PeriodLockRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [period, setPeriod] = useState(currentMonthValue());
  const [note, setNote] = useState("");
  const [unlockReasons, setUnlockReasons] = useState<Record<string, string>>({});
  const [actionKey, setActionKey] = useState<ActionKey>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lockAllowed = canLockPeriod(capabilities);
  const unlockAllowed = canUnlockPeriod(capabilities);

  async function loadLocks() {
    setLoadState("loading");
    setLocks([]);
    setError(null);
    try {
      setLocks(await listPeriodLocks());
      setLoadState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取锁账期间失败");
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadLocks();
  }, []);

  async function handleLock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lockAllowed || actionKey) return;

    const nextPeriod = period.trim();
    if (!nextPeriod) {
      setError("请选择锁定期间");
      return;
    }

    setActionKey("lock");
    setError(null);
    setMessage(null);
    try {
      await lockPeriod(nextPeriod, note.trim());
      setNote("");
      setMessage(`已锁定 ${nextPeriod}`);
      await loadLocks();
    } catch (lockError) {
      setError(lockError instanceof Error ? lockError.message : "锁定期间失败");
    } finally {
      setActionKey(null);
    }
  }

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>, lock: PeriodLockRow) {
    event.preventDefault();
    if (!unlockAllowed || actionKey) return;

    const reason = (unlockReasons[lock.period] ?? "").trim();
    if (!reason) {
      setError("请填写解锁原因");
      return;
    }

    setActionKey(`unlock:${lock.period}`);
    setError(null);
    setMessage(null);
    try {
      await unlockPeriod(lock.period, reason);
      setUnlockReasons((current) => {
        const next = { ...current };
        delete next[lock.period];
        return next;
      });
      setMessage(`已解锁 ${lock.period}`);
      await loadLocks();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "解锁期间失败");
    } finally {
      setActionKey(null);
    }
  }

  return (
    <div className="page-stack period-locks-page">
      <section className="panel">
        <div className="panel-header">
          <h2>期间锁</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {loadState === "loading" ? "读取中" : loadState === "error" ? "读取失败" : `${locks.length} 个期间`}
          </div>
        </div>

        {lockAllowed ? (
          <form className="form-grid period-lock-form" onSubmit={(event) => void handleLock(event)}>
            <label>
              锁定期间
              <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
            </label>
            <label className="wide-field">
              备注
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选" />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={actionKey !== null}>
                {actionKey === "lock" ? "锁定中" : "锁定期间"}
              </button>
            </div>
          </form>
        ) : (
          <div className="workspace-placeholder">当前账号没有锁定期间权限。</div>
        )}

        {error ? <div className="notice error">{error}</div> : null}
        {message ? (
          <div className="message-line" role="status" aria-live="polite">
            {message}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>已锁定期间</h2>
          <div className="status-slot">{unlockAllowed ? "可解锁" : "只读"}</div>
        </div>
        <div className="table-wrap">
          <table className="data-table period-lock-table">
            <thead>
              <tr>
                <th>期间</th>
                <th>锁定人</th>
                <th>锁定时间</th>
                <th>备注</th>
                {unlockAllowed ? <th>解锁</th> : null}
              </tr>
            </thead>
            <tbody>
              {loadState === "loading" ? (
                <tr>
                  <td colSpan={unlockAllowed ? 5 : 4} className="empty-cell">
                    读取中
                  </td>
                </tr>
              ) : locks.length > 0 ? (
                locks.map((lock) => (
                  <tr key={lock.period}>
                    <td className="mono">{lock.period}</td>
                    <td className="mono">{lock.locked_by}</td>
                    <td className="mono">{lock.locked_at}</td>
                    <td>{lock.note || "-"}</td>
                    {unlockAllowed ? (
                      <td>
                        <form className="period-lock-unlock-form" onSubmit={(event) => void handleUnlock(event, lock)}>
                          <input
                            aria-label={`${lock.period} 解锁原因`}
                            value={unlockReasons[lock.period] ?? ""}
                            onChange={(event) =>
                              setUnlockReasons((current) => ({ ...current, [lock.period]: event.target.value }))
                            }
                            placeholder="解锁原因"
                            required
                            disabled={actionKey !== null}
                          />
                          <button
                            type="submit"
                            className="secondary-button"
                            disabled={actionKey !== null || !(unlockReasons[lock.period] ?? "").trim()}
                          >
                            {actionKey === `unlock:${lock.period}` ? "解锁中" : "解锁"}
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={unlockAllowed ? 5 : 4} className="empty-cell">
                    暂无锁定期间
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function currentMonthValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}
