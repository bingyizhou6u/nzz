function assertMinorUnits(minorUnits: number): void {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 8) {
    throw new Error(`Invalid minor units: ${minorUnits}`);
  }
}

function assertSafeMinor(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money amount exceeds safe integer range: ${value}`);
  }
}

export function parseMinor(input: string, minorUnits: number): number {
  assertMinorUnits(minorUnits);

  const trimmed = input.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid money amount: ${input}`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > minorUnits) {
    throw new Error(`Too many decimal places for minor units: ${minorUnits}`);
  }

  const padded = fraction.padEnd(minorUnits, "0").slice(0, minorUnits);
  const value = Number(`${whole}${padded || ""}`);
  const amountMinor = negative ? -value : value;
  assertSafeMinor(amountMinor);
  return amountMinor;
}

export function formatMinor(amountMinor: number, minorUnits: number): string {
  assertMinorUnits(minorUnits);
  assertSafeMinor(amountMinor);

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
  return values.reduce((sum, value) => {
    assertSafeMinor(value);
    const next = sum + value;
    assertSafeMinor(next);
    return next;
  }, 0);
}
