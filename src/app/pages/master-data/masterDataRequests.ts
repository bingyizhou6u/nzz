interface ErrorEnvelope {
  error?: unknown;
  message?: unknown;
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as ErrorEnvelope;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
  } catch {
    return `${response.status} ${response.statusText}`.trim() || "请求失败";
  }
  return `${response.status} ${response.statusText}`.trim() || "请求失败";
}

export async function writeMasterData(url: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
