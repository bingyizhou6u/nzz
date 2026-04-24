import type { Lot, LotAllocation } from "./types";

export interface FifoOptions {
  allowUnmatched?: boolean;
}

export interface FifoResult {
  allocations: LotAllocation[];
  unmatchedAmountMinor: number;
}

export function allocateFifo(
  lots: Lot[],
  requestedAmountMinor: number,
  currencyCode: string,
  options: FifoOptions = {}
): FifoResult {
  if (!Number.isSafeInteger(requestedAmountMinor) || requestedAmountMinor <= 0) {
    throw new Error("Requested amount must be a positive safe integer");
  }

  for (const lot of lots) {
    if (!lot.id) {
      throw new Error("Lot id must be non-empty");
    }
    if (!lot.lotDate) {
      throw new Error("Lot date must be non-empty");
    }
    if (lot.currencyCode !== currencyCode) {
      throw new Error("Lot currency does not match requested currency");
    }
    if (!Number.isSafeInteger(lot.remainingAmountMinor) || lot.remainingAmountMinor < 0) {
      throw new Error("Lot remaining amount must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(lot.remainingUsdtCostMinor) || lot.remainingUsdtCostMinor < 0) {
      throw new Error("Lot remaining USDT cost must be a non-negative safe integer");
    }
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
    allocations.push({
      lotId: lot.id,
      amountMinor,
      usdtCostMinor,
      remainingAmountMinorBefore: lot.remainingAmountMinor,
      remainingUsdtCostMinorBefore: lot.remainingUsdtCostMinor
    });
    remaining -= amountMinor;
  }

  if (remaining > 0 && !options.allowUnmatched) {
    throw new Error("Insufficient lot balance");
  }

  return { allocations, unmatchedAmountMinor: remaining };
}
