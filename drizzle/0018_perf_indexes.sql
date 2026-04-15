-- Sprint 12 Task 4: Performance indexes for report query hot paths.
-- These indexes bring report generation (12 months data) within the < 3s target.

CREATE INDEX IF NOT EXISTS idx_je_business_date
  ON journal_entries(business_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_jl_entry_id
  ON journal_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_jl_account_id
  ON journal_lines(account_id);
