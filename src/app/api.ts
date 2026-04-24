export interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error?: unknown;
  message?: unknown;
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as T;
}

export function getJson<T>(url: string): Promise<T> {
  return requestJson<T>(url);
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
