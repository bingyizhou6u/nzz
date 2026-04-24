CREATE INDEX IF NOT EXISTS idx_lots_account_person_currency_date ON lots(current_account_id, current_person_id, currency_code, status, lot_date);
CREATE INDEX IF NOT EXISTS idx_lot_movements_document_id ON lot_movements(document_id);
CREATE INDEX IF NOT EXISTS idx_lot_movements_lot_date ON lot_movements(lot_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_pending_cost_matches_lookup ON pending_cost_matches(account_id, person_id, currency_code, status, expense_date, created_at);
