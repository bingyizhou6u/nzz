export interface PeriodLockRow {
  period: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

export interface PeriodLockActionResult {
  period: string;
  status: "locked" | "unlocked";
}
