export function formatMinor(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatOptional(value: string | null | undefined) {
  return value || "-";
}
