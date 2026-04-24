import { type FormEvent, useEffect, useState } from "react";
import { getJson, postJson, type ApiEnvelope } from "../api";

interface Currency {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: boolean | number;
}

interface ProjectResponse {
  id: string;
  code: string;
  name: string;
}

const initialProjectForm = {
  code: "",
  name: "",
  note: ""
};

export function MasterDataPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(initialProjectForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadCurrencies() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await getJson<ApiEnvelope<Currency[]>>("/api/currencies");
        if (isCurrent) {
          setCurrencies(response.data);
        }
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : "读取币种失败");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadCurrencies();

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage(null);
    setSubmitError(null);

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      note: form.note.trim() || undefined
    };

    try {
      const response = await postJson<ApiEnvelope<ProjectResponse>>("/api/projects", payload);
      setSubmitMessage(`已创建项目 ${response.data.code} / ${response.data.name}`);
      setForm(initialProjectForm);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>币种</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {isLoading ? "读取中" : loadError ? "读取失败" : `${currencies.length} 条`}
          </div>
        </div>

        {loadError ? <div className="notice error">{loadError}</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>代码</th>
                <th>名称</th>
                <th>小数位</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    读取中
                  </td>
                </tr>
              ) : currencies.length > 0 ? (
                currencies.map((currency) => (
                  <tr key={currency.code}>
                    <td className="mono">{currency.code}</td>
                    <td>{currency.name}</td>
                    <td>{currency.minor_units}</td>
                    <td>
                      <span className={currency.is_enabled ? "tag ok" : "tag muted"}>
                        {currency.is_enabled ? "启用" : "停用"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>创建项目</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {isSubmitting ? "提交中" : submitError ? "失败" : submitMessage ? "完成" : "待提交"}
          </div>
        </div>

        <form className="form-grid project-form" onSubmit={handleSubmit}>
          <label>
            项目代码
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              required
              maxLength={64}
            />
          </label>
          <label>
            项目名称
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              maxLength={120}
            />
          </label>
          <label className="wide-field">
            备注
            <input
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              maxLength={240}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "提交中" : "创建"}
            </button>
          </div>
        </form>

        <div className="message-line" role="status" aria-live="polite">
          {submitError ? <span className="text-error">{submitError}</span> : submitMessage}
        </div>
      </section>
    </div>
  );
}
