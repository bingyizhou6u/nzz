export function parseMinor(input: string, minorUnits: number): number {
  const trimmed = input.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid money amount: ${input}`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = fraction.padEnd(minorUnits, "0").slice(0, minorUnits);
  const value = Number(`${whole}${padded || ""}`);
  return negative ? -value : value;
}

export function formatMinor(amountMinor: number, minorUnits: number): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  if (minorUnits === 0) {
    return `${negative ? "-" : ""}${abs}`;
  }
  const divisor = 10 ** minorUnits;
  const whole = Math.floor(abs / divisor);
  const fraction = String(abs % divisor).padStart(minorUnits, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function addMinor(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
