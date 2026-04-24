export interface RawDocumentLine {
  lineType?: unknown;
  accountId?: unknown;
  counterpartyAccountId?: unknown;
  personId?: unknown;
  borrowerPersonId?: unknown;
  currencyCode?: unknown;
  amountMinor?: unknown;
  usdtAmountMinor?: unknown;
  exchangeRateText?: unknown;
  note?: unknown;
}

export interface NormalizedDocumentLine {
  lineNo: number;
  lineType: string;
  accountId: string;
  counterpartyAccountId: string | null;
  personId: string | null;
  borrowerPersonId: string | null;
  currencyCode: string;
  amountMinor: number;
  usdtAmountMinor: number | null;
  exchangeRateText: string | null;
  note: string | null;
}

export function normalizeDocumentLines(lines: RawDocumentLine[]): NormalizedDocumentLine[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("At least one document line is required");
  }

  return lines.map((line, index) => {
    const lineType = textOrDefault(line.lineType, "main");
    const accountId = requiredText(line.accountId, "line accountId");
    const currencyCode = requiredText(line.currencyCode, "line currencyCode").toUpperCase();
    const amountMinor = positiveSafeInteger(line.amountMinor, "line amountMinor");

    return {
      lineNo: index + 1,
      lineType,
      accountId,
      counterpartyAccountId: optionalText(line.counterpartyAccountId),
      personId: optionalText(line.personId),
      borrowerPersonId: optionalText(line.borrowerPersonId),
      currencyCode,
      amountMinor,
      usdtAmountMinor: optionalSafeInteger(line.usdtAmountMinor, "line usdtAmountMinor"),
      exchangeRateText: optionalText(line.exchangeRateText),
      note: optionalText(line.note)
    };
  });
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function textOrDefault(value: unknown, defaultValue: string) {
  if (typeof value !== "string") return defaultValue;
  const trimmed = value.trim();
  return trimmed ? trimmed : defaultValue;
}

function positiveSafeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function optionalSafeInteger(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value as number;
}
