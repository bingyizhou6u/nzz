import { getJson, postJson, type ApiEnvelope } from "../../api";
import type { PeriodLockActionResult, PeriodLockRow } from "./periodLockTypes";

const periodLocksPath = "/api/period-locks";

interface ApiErrorEnvelope {
  error?: unknown;
  message?: unknown;
}

export async function listPeriodLocks(): Promise<PeriodLockRow[]> {
  const response = await getJson<ApiEnvelope<PeriodLockRow[]>>(periodLocksPath);
  return response.data;
}

export async function lockPeriod(period: string, note: string): Promise<PeriodLockActionResult> {
  const response = await postJson<ApiEnvelope<PeriodLockActionResult>>(periodLocksPath, { period, note });
  return response.data;
}

export async function unlockPeriod(period: string, reason: string): Promise<PeriodLockActionResult> {
  const response = await fetch(`${periodLocksPath}/${encodeURIComponent(period)}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const body = (await response.json()) as ApiEnvelope<PeriodLockActionResult>;
  return body.data;
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();

  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as ApiErrorEnvelope;
      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
      if (typeof body.message === "string" && body.message.trim()) {
        return body.message;
      }
    } else {
      const text = await response.text();
      if (text.trim()) {
        return text.trim();
      }
    }
  } catch {
    return fallback || "Request failed";
  }

  return fallback || "Request failed";
}
