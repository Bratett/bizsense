-- =============================================================================
-- BizSense Ghana — Row-Level Security Policies
-- Sprint 1, Task C
--
-- Run this once in the Supabase SQL editor (or via psql) before writing any
-- application data. It is idempotent: DROP POLICY IF EXISTS is used throughout
-- so the file can be re-executed safely.
--
-- Pattern for tables with a direct business_id column:
--   USING / WITH CHECK: business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
--
-- Pattern for child tables (no direct business_id):
--   Subquery into parent table to resolve the owning business.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SPECIAL CASE: businesses
-- The PK "id" IS the business — there is no business_id column.
-- No INSERT policy: businesses are created via service role only (onboarding).
-- ---------------------------------------------------------------------------

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_select" ON businesses;
CREATE POLICY "businesses_select" ON businesses
  FOR SELECT
  USING (
    id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "businesses_update" ON businesses;
CREATE POLICY "businesses_update" ON businesses
  FOR UPDATE
  USING (
    id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- SPECIAL CASE: users
-- SELECT only — INSERT/UPDATE performed via service role in Server Actions.
-- ---------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- STANDARD TABLES (direct business_id column)
-- Each block: ENABLE RLS + SELECT + INSERT + UPDATE
-- ---------------------------------------------------------------------------

-- accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_select" ON accounts;
CREATE POLICY "accounts_select" ON accounts
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "accounts_insert" ON accounts;
CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "accounts_update" ON accounts;
CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- tax_components
ALTER TABLE tax_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_components_select" ON tax_components;
CREATE POLICY "tax_components_select" ON tax_components
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "tax_components_insert" ON tax_components;
CREATE POLICY "tax_components_insert" ON tax_components
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "tax_components_update" ON tax_components;
CREATE POLICY "tax_components_update" ON tax_components
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- journal_entries
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entries_select" ON journal_entries;
CREATE POLICY "journal_entries_select" ON journal_entries
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "journal_entries_insert" ON journal_entries;
CREATE POLICY "journal_entries_insert" ON journal_entries
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "journal_entries_update" ON journal_entries;
CREATE POLICY "journal_entries_update" ON journal_entries
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- payments_received
ALTER TABLE payments_received ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_received_select" ON payments_received;
CREATE POLICY "payments_received_select" ON payments_received
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "payments_received_insert" ON payments_received;
CREATE POLICY "payments_received_insert" ON payments_received
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "payments_received_update" ON payments_received;
CREATE POLICY "payments_received_update" ON payments_received
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select" ON expenses;
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "expenses_insert" ON expenses;
CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "expenses_update" ON expenses;
CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "suppliers_insert" ON suppliers;
CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "suppliers_update" ON suppliers;
CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert" ON products
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update" ON products
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- inventory_transactions
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_transactions_select" ON inventory_transactions;
CREATE POLICY "inventory_transactions_select" ON inventory_transactions
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "inventory_transactions_insert" ON inventory_transactions;
CREATE POLICY "inventory_transactions_insert" ON inventory_transactions
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "inventory_transactions_update" ON inventory_transactions;
CREATE POLICY "inventory_transactions_update" ON inventory_transactions
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- purchase_orders
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
CREATE POLICY "purchase_orders_select" ON purchase_orders
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
CREATE POLICY "purchase_orders_insert" ON purchase_orders
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
CREATE POLICY "purchase_orders_update" ON purchase_orders
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- goods_received_notes
ALTER TABLE goods_received_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goods_received_notes_select" ON goods_received_notes;
CREATE POLICY "goods_received_notes_select" ON goods_received_notes
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "goods_received_notes_insert" ON goods_received_notes;
CREATE POLICY "goods_received_notes_insert" ON goods_received_notes
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "goods_received_notes_update" ON goods_received_notes;
CREATE POLICY "goods_received_notes_update" ON goods_received_notes
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- fixed_assets
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fixed_assets_select" ON fixed_assets;
CREATE POLICY "fixed_assets_select" ON fixed_assets
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "fixed_assets_insert" ON fixed_assets;
CREATE POLICY "fixed_assets_insert" ON fixed_assets
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "fixed_assets_update" ON fixed_assets;
CREATE POLICY "fixed_assets_update" ON fixed_assets
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_insert" ON staff;
CREATE POLICY "staff_insert" ON staff
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_update" ON staff;
CREATE POLICY "staff_update" ON staff
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- payroll_runs
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_runs_select" ON payroll_runs;
CREATE POLICY "payroll_runs_select" ON payroll_runs
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "payroll_runs_insert" ON payroll_runs;
CREATE POLICY "payroll_runs_insert" ON payroll_runs
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "payroll_runs_update" ON payroll_runs;
CREATE POLICY "payroll_runs_update" ON payroll_runs
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- fx_rates
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fx_rates_select" ON fx_rates;
CREATE POLICY "fx_rates_select" ON fx_rates
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "fx_rates_insert" ON fx_rates;
CREATE POLICY "fx_rates_insert" ON fx_rates
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "fx_rates_update" ON fx_rates;
CREATE POLICY "fx_rates_update" ON fx_rates
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- pending_ai_actions
ALTER TABLE pending_ai_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_ai_actions_select" ON pending_ai_actions;
CREATE POLICY "pending_ai_actions_select" ON pending_ai_actions
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "pending_ai_actions_insert" ON pending_ai_actions;
CREATE POLICY "pending_ai_actions_insert" ON pending_ai_actions
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "pending_ai_actions_update" ON pending_ai_actions;
CREATE POLICY "pending_ai_actions_update" ON pending_ai_actions
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- ai_conversation_logs
ALTER TABLE ai_conversation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_conversation_logs_select" ON ai_conversation_logs;
CREATE POLICY "ai_conversation_logs_select" ON ai_conversation_logs
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "ai_conversation_logs_insert" ON ai_conversation_logs;
CREATE POLICY "ai_conversation_logs_insert" ON ai_conversation_logs
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "ai_conversation_logs_update" ON ai_conversation_logs;
CREATE POLICY "ai_conversation_logs_update" ON ai_conversation_logs
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- ledger_integrity_log
ALTER TABLE ledger_integrity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ledger_integrity_log_select" ON ledger_integrity_log;
CREATE POLICY "ledger_integrity_log_select" ON ledger_integrity_log
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "ledger_integrity_log_insert" ON ledger_integrity_log;
CREATE POLICY "ledger_integrity_log_insert" ON ledger_integrity_log
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "ledger_integrity_log_update" ON ledger_integrity_log;
CREATE POLICY "ledger_integrity_log_update" ON ledger_integrity_log
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- CHILD TABLES (no direct business_id — inherit via parent)
-- ---------------------------------------------------------------------------

-- journal_lines → journal_entries
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_lines_select" ON journal_lines;
CREATE POLICY "journal_lines_select" ON journal_lines
  FOR SELECT
  USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "journal_lines_insert" ON journal_lines;
CREATE POLICY "journal_lines_insert" ON journal_lines
  FOR INSERT
  WITH CHECK (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "journal_lines_update" ON journal_lines;
CREATE POLICY "journal_lines_update" ON journal_lines
  FOR UPDATE
  USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );


-- order_lines → orders
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_lines_select" ON order_lines;
CREATE POLICY "order_lines_select" ON order_lines
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "order_lines_insert" ON order_lines;
CREATE POLICY "order_lines_insert" ON order_lines
  FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "order_lines_update" ON order_lines;
CREATE POLICY "order_lines_update" ON order_lines
  FOR UPDATE
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );


-- purchase_order_lines → purchase_orders
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_order_lines_select" ON purchase_order_lines;
CREATE POLICY "purchase_order_lines_select" ON purchase_order_lines
  FOR SELECT
  USING (
    po_id IN (
      SELECT id FROM purchase_orders
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "purchase_order_lines_insert" ON purchase_order_lines;
CREATE POLICY "purchase_order_lines_insert" ON purchase_order_lines
  FOR INSERT
  WITH CHECK (
    po_id IN (
      SELECT id FROM purchase_orders
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "purchase_order_lines_update" ON purchase_order_lines;
CREATE POLICY "purchase_order_lines_update" ON purchase_order_lines
  FOR UPDATE
  USING (
    po_id IN (
      SELECT id FROM purchase_orders
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );


-- grn_lines → goods_received_notes
ALTER TABLE grn_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grn_lines_select" ON grn_lines;
CREATE POLICY "grn_lines_select" ON grn_lines
  FOR SELECT
  USING (
    grn_id IN (
      SELECT id FROM goods_received_notes
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "grn_lines_insert" ON grn_lines;
CREATE POLICY "grn_lines_insert" ON grn_lines
  FOR INSERT
  WITH CHECK (
    grn_id IN (
      SELECT id FROM goods_received_notes
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "grn_lines_update" ON grn_lines;
CREATE POLICY "grn_lines_update" ON grn_lines
  FOR UPDATE
  USING (
    grn_id IN (
      SELECT id FROM goods_received_notes
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );


-- payroll_lines → payroll_runs
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_lines_select" ON payroll_lines;
CREATE POLICY "payroll_lines_select" ON payroll_lines
  FOR SELECT
  USING (
    payroll_run_id IN (
      SELECT id FROM payroll_runs
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "payroll_lines_insert" ON payroll_lines;
CREATE POLICY "payroll_lines_insert" ON payroll_lines
  FOR INSERT
  WITH CHECK (
    payroll_run_id IN (
      SELECT id FROM payroll_runs
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "payroll_lines_update" ON payroll_lines;
CREATE POLICY "payroll_lines_update" ON payroll_lines
  FOR UPDATE
  USING (
    payroll_run_id IN (
      SELECT id FROM payroll_runs
      WHERE business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
    )
  );
