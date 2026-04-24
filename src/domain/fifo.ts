import type { Lot, LotAllocation } from "./types";

export interface FifoOptions {
  allowUnmatched?: boolean;
}

export interface FifoResult {
  allocations: LotAllocation[];
  unmatchedAmountMinor: number;
}

export function allocateFifo(lots: Lot[], requestedAmountMinor: number, options: FifoOptions = {}): FifoResult {
  if (requestedAmountMinor <= 0) {
    throw new Error("Requested amount must be positive");
  }

  const ordered = [...lots]
    .filter((lot) => lot.remainingAmountMinor > 0)
    .sort((a, b) => a.lotDate.localeCompare(b.lotDate) || a.id.localeCompare(b.id));

  let remaining = requestedAmountMinor;
  const allocations: LotAllocation[] = [];

  for (const lot of ordered) {
    if (remaining === 0) break;
    const amountMinor = Math.min(remaining, lot.remainingAmountMinor);
    const usdtCostMinor = Math.round((amountMinor / lot.remainingAmountMinor) * lot.remainingUsdtCostMinor);
    allocations.push({ lotId: lot.id, amountMinor, usdtCostMinor });
    remaining -= amountMinor;
  }

  if (remaining > 0 && !options.allowUnmatched) {
    throw new Error("Insufficient lot balance");
  }

  return { allocations, unmatchedAmountMinor: remaining };
}
