CREATE INDEX IF NOT EXISTS idx_lots_fifo_open_lookup ON lots(current_account_id, currency_code, current_person_id, lot_date, id) WHERE status = 'open' AND remaining_amount_minor > 0;
CREATE INDEX IF NOT EXISTS idx_lots_report_balance_order ON lots(current_account_id, currency_code, lot_date, id) WHERE remaining_amount_minor > 0;
CREATE INDEX IF NOT EXISTS idx_lot_movements_report_order ON lot_movements(movement_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_cost_matches_fifo_order ON pending_cost_matches(account_id, person_id, currency_code, expense_date, created_at, id) WHERE status IN ('open', 'partial') AND remaining_amount_minor > 0;
CREATE INDEX IF NOT EXISTS idx_pending_cost_matches_report_order ON pending_cost_matches(expense_date, created_at) WHERE status IN ('open', 'partial') AND remaining_amount_minor > 0;
