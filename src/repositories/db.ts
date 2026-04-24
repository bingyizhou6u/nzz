export async function all<T>(stmt: D1PreparedStatement): Promise<T[]> {
  const result = await stmt.all<T>();
  if (!result.success) {
    throw new Error(result.error || "D1 query failed");
  }
  return result.results || [];
}

export async function first<T>(stmt: D1PreparedStatement): Promise<T | null> {
  return (await stmt.first<T>()) ?? null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
