# CLAUDE.md — BizSense Ghana

This file is the persistent architectural context for every coding session.
Read it in full before writing any code. Every rule here exists because
violating it causes structural damage that is expensive to repair.

# Note:

Always consult the `docs/SME_Product_Specification.md` for full product specs when confused
Consult the `DESIGN.md` for UI Designs of the system

---

## 1. Product Identity

**BizSense Ghana** is an offline-first, AI-native Progressive Web App for
Ghanaian SMEs (1–20 employees). It manages sales, expenses, inventory,
customers, suppliers, payroll, and financial reporting.

**Core constraints that drive every technical decision:**

- Works fully offline on low-end Android phones (Tecno, Itel, Infinix)
- MoMo (Mobile Money) is the primary payment rail — not cards, not bank transfer
- GHS is the base currency; USD dual-pricing is common among trading SMEs
- Ghana's VAT is cascading and compounded — never a flat percentage
- The accounting engine must be double-entry correct — not approximate

---

## 2. Technology Stack

Do not suggest alternatives. Do not upgrade versions mid-build.

| Layer                                | Technology                                                          |
| ------------------------------------ | ------------------------------------------------------------------- |
| Framework                            | Next.js 15, App Router, TypeScript strict mode                      |
| Styling                              | Tailwind CSS only — no CSS modules, no styled-components            |
| Local DB                             | IndexedDB via Dexie.js                                              |
| Cloud DB / Auth / Storage / Realtime | Supabase (Postgres + Auth + Storage + Realtime)                     |
| Auth SSR                             | `@supabase/ssr`                                                     |
| ORM                                  | Drizzle ORM — server-side only, never in browser                    |
| Migrations                           | drizzle-kit                                                         |
| Testing                              | Vitest                                                              |
| PDF                                  | react-pdf, always in a Web Worker                                   |
| PWA                                  | next-pwa (Workbox)                                                  |
| Payments                             | Hubtel API or Paystack Ghana                                        |
| Notifications                        | WhatsApp via Twilio or Hubtel; SMS via Africa's Talking as fallback |
| Hosting                              | Vercel (full stack) + Supabase                                      |

---

## 3. Project Structure

```
src/
  app/
    (auth)/                  ← login, signup, OTP — unauthenticated routes
    (dashboard)/             ← all protected routes
      ledger/                ← General Ledger view (developer + accountant)
      dashboard/
      sales/
      expenses/
      customers/
      inventory/
      suppliers/
      reports/
      payroll/
      settings/
    api/
      ai/chat/route.ts       ← AI assistant proxy — Anthropic API
      sync/route.ts          ← offline sync pull/push endpoint
      reconcile/route.ts     ← ledger integrity reconciliation trigger
  actions/                   ← ALL Server Actions live here
    sales.ts
    expenses.ts
    payments.ts
    inventory.ts
    payroll.ts
    onboarding.ts
  db/
    index.ts                 ← Drizzle client (db export)
    schema/
      core.ts                ← businesses, users
      accounts.ts            ← accounts (chart of accounts)
      tax.ts                 ← tax_components
      journal.ts             ← journal_entries, journal_lines
      transactions.ts        ← customers, orders, order_lines,
                                payments_received, expenses
      inventory.ts           ← products, inventory_transactions, suppliers,
                                purchase_orders, purchase_order_lines,
                                goods_received_notes, grn_lines, fixed_assets
      payroll.ts             ← staff, payroll_runs, payroll_lines
      fx.ts                  ← fx_rates
      ai.ts                  ← pending_ai_actions, ai_conversation_logs
      integrity.ts           ← ledger_integrity_log
      index.ts               ← re-exports all schemas
  lib/
    supabase/
      server.ts              ← createServerClient (uses @supabase/ssr)
      client.ts              ← createBrowserClient
    session.ts               ← getServerSession() — used in every Server Action
    ledger.ts                ← postJournalEntry(), reverseJournalEntry()
    tax.ts                   ← calculateTax() — reads tax_components at runtime
    atomic.ts                ← atomicTransactionWrite() — mandatory write wrapper
    reconciliation.ts        ← runLedgerReconciliation()
  middleware.ts              ← protects (dashboard) routes, refreshes session
drizzle.config.ts
next.config.js               ← next-pwa configuration
```

Client Components are suffixed `.client.tsx`.
Server Components are the default — no suffix needed.
Never put a Drizzle import in a `.client.tsx` file.

---

## 4. Non-Negotiable Architectural Rules

Violating any of these rules causes structural damage.
Do not work around them. Do not ask if exceptions are acceptable.

### 4.1 Double-Entry Accounting

Every financial transaction posts a journal entry with explicit debit and
credit lines. Reports are queries against journal_lines — never from
denormalised totals or summary fields.

**The invariant:** For every journal_entry,
`SUM(debit_amount) = SUM(credit_amount)`.
Validate this BEFORE writing to the database. If it fails, throw — do not
write partial entries.

```typescript
// src/lib/ledger.ts — postJournalEntry() enforces this
const totalDebits = lines.reduce((s, l) => s + l.debitAmount, 0)
const totalCredits = lines.reduce((s, l) => s + l.creditAmount, 0)
if (Math.abs(totalDebits - totalCredits) > 0.001) {
  throw new Error(`Journal entry does not balance: dr=${totalDebits} cr=${totalCredits}`)
}
```

Never store computed account balances. Balances are derived at query time.
Never store running totals on customer, supplier, or inventory records.

### 4.2 Atomic Write Pattern

Every operation that writes a source record (order, expense, GRN, payroll run)
AND a journal entry must use `atomicTransactionWrite()` from `src/lib/atomic.ts`.

```typescript
// CORRECT
await atomicTransactionWrite(journalInput, async (tx, journalEntryId) => {
  return await tx
    .insert(orders)
    .values({ ...data, journalEntryId })
    .returning()
})

// WRONG — never do this
await db.insert(orders).values(data)
await db.insert(journalEntries).values(entry) // if this fails: orphan record
```

This is enforced by design. If you see a write to orders, expenses, grn,
or payroll_runs without atomicTransactionWrite, that is a bug.

### 4.3 business_id Always from Server-Side Session

Every Drizzle query on any transactional table must include a businessId
filter. That businessId must come from the server-side session — never from
user input, request body, URL params, or AI output.

```typescript
// CORRECT
'use server'
export async function getSales() {
  const session = await getServerSession() // throws if not authenticated
  const businessId = session.user.businessId // from verified session cookie
  return db.select().from(orders).where(eq(orders.businessId, businessId))
}

// WRONG — never do this
export async function getSales(businessId: string) {
  // businessId from client = security hole
  return db.select().from(orders).where(eq(orders.businessId, businessId))
}
```

This rule also applies to the AI API Route. `business_id` is injected
server-side from the session into every tool handler — it is never a
parameter Claude fills in from the user's message.

### 4.4 Drizzle is Server-Side Only

Drizzle never runs in the browser. No Drizzle import in any `.client.tsx`
file or in any file under `app/` that is rendered client-side.

The browser's data layer is Dexie.js (IndexedDB). The server's data layer
is Drizzle. They are parallel systems with different responsibilities.

### 4.5 Tax Rates are Never Hardcoded

Ghana's tax rates are read from the `tax_components` table at runtime.
The effective VAT rate is approximately 21.9% — not 21%, not 0.21.

```typescript
// WRONG — never do this
const vatAmount = supplyAmount * 0.219

// CORRECT
const { totalTaxAmount } = await calculateTax(businessId, supplyAmount)
```

The cascading calculation:

- NHIL: 2.5% on base amount (non-compounded)
- GETFund: 2.5% on base amount (non-compounded)
- COVID: 1.0% on base amount (non-compounded, verify GRA current status)
- VAT: 15% on (base + NHIL + GETFund + COVID) — compounded

When GRA changes levy rates or introduces new levies, only the database
record changes. No code deployment required.

### 4.6 FX Rate Locking

When a transaction involves a non-GHS currency, the exchange rate used must
be locked at the moment of posting and stored in `journal_lines.fxRate` and
`journal_lines.fxRateLockedAt`. Never re-derive historical rates from the
`fx_rates` table retrospectively.

```typescript
// CORRECT — lock rate at transaction time
const currentRate = await getCurrentFxRate(businessId, 'USD', 'GHS')
await postJournalEntry(tx, {
  lines: [
    {
      accountId: cashAccountId,
      debitAmount: usdAmount * currentRate.rate,
      fxRate: currentRate.rate,
      fxRateLockedAt: new Date(),
      currency: 'USD',
    },
  ],
})
```

### 4.7 No Balance Fields on Entity Tables

The following fields must NEVER appear on these tables:

| Table     | Forbidden Fields                           |
| --------- | ------------------------------------------ |
| accounts  | balance, current_balance                   |
| customers | balance, amount_owed, total_purchases      |
| suppliers | balance, amount_owed                       |
| products  | stock_count, quantity_on_hand, stock_value |

All of these are derived from transactions at query time.

---

## 5. Data Model Summary

### Schema Rules (apply to every table)

Every table has:

- `id: uuid().primaryKey().defaultRandom()`
- `createdAt: timestamp().defaultNow().notNull()`
- `updatedAt: timestamp().defaultNow().notNull()`

Every transactional table (everything except `businesses` and `users`) has:

- `businessId: uuid().notNull().references(() => businesses.id)`

All monetary amounts use `numeric({ precision: 15, scale: 2 })`.
All IDs are UUID. Never use serial or integer primary keys.

### Key Table Relationships

```
businesses
  └── users (role: owner | manager | cashier | accountant)
  └── accounts (Chart of Accounts — seeded on business creation)
  └── tax_components (Ghana GRA levy structure — seeded on creation)
  └── journal_entries → journal_lines (source of truth for all reports)
  └── customers → orders → order_lines
                        → payments_received
  └── suppliers → purchase_orders → purchase_order_lines
               → goods_received_notes → grn_lines
  └── products → inventory_transactions (FIFO — no stored stock count)
  └── fixed_assets (depreciation tracked via journal entries)
  └── staff → payroll_runs → payroll_lines
  └── fx_rates (reference rates — not used retrospectively)
  └── pending_ai_actions (staging — AI writes here before user confirms)
  └── ai_conversation_logs (audit trail)
  └── ledger_integrity_log (orphan records, imbalanced entries)
```

### Default Chart of Accounts (seeded on business creation)

| Code      | Name                      | Type           | Cash Flow |
| --------- | ------------------------- | -------------- | --------- |
| 1001–1005 | Cash, MoMo accounts, Bank | Asset          | Operating |
| 1100      | Accounts Receivable       | Asset          | Operating |
| 1101      | Input VAT Recoverable     | Asset          | Operating |
| 1200      | Inventory                 | Asset          | Operating |
| 1500      | Fixed Assets — Cost       | Asset          | Investing |
| 1510      | Accumulated Depreciation  | Asset (contra) | Investing |
| 2001      | Accounts Payable          | Liability      | Operating |
| 2100      | VAT Payable               | Liability      | Operating |
| 2200–2300 | SSNIT, PAYE Payable       | Liability      | Operating |
| 2400      | Loans Payable             | Liability      | Financing |
| 3001      | Owner's Equity / Capital  | Equity         | Financing |
| 4001–4004 | Revenue accounts          | Revenue        | Operating |
| 5001      | Cost of Goods Sold        | COGS           | Operating |
| 6001–6009 | Expense accounts          | Expense        | Operating |

---

## 6. Offline-First Architecture

### Dexie (IndexedDB) is the Primary Store

All reads and writes go to IndexedDB first. The UI never waits for the
network. Supabase sync is always background behaviour.

On first app load:

1. Call `navigator.storage.persist()` — required, not optional. Without
   this, Android browsers can evict IndexedDB silently. Handle the case
   where the user declines and surface a clear warning.
2. Authenticate (requires network — first auth only)
3. Full sync from Supabase → IndexedDB
4. App is offline-capable indefinitely from this point

### Sync Architecture

```
Write:
  User action → IndexedDB (instant) → sync_queue → UI success
  Background: sync_queue → POST /api/sync → Drizzle upsert → Supabase Postgres

Read:
  Always from IndexedDB first
  On reconnect / every 30s: GET /api/sync/pull?since={lastSyncedAt} → IndexedDB delta update
  Supabase Realtime subscription for multi-device push (via Supabase JS client)
```

### Conflict Resolution

Last-write-wins based on `updatedAt` timestamp comparison.
This applies to configuration data (product prices, credit limits).
Financial data (journal entries) is append-only — never overwritten.

### Order / Invoice Number Generation (Offline-Safe)

Online: server assigns clean sequential number (ORD-0001).
Offline: locally generate ORD-{devicePrefix}-{seq} where devicePrefix
is the first 4 chars of a UUID assigned to the device on first install.
Store the local number in `localOrderNumber` for traceability.
On sync, the server-assigned number overwrites `orderNumber`.

---

## 7. Security Rules

### Authentication

All routes under `(dashboard)` are protected by `middleware.ts`.
`getServerSession()` is called at the top of every Server Action.
If the session is missing or expired, throw — never proceed.

```typescript
// Every Server Action starts with this
const session = await getServerSession()
if (!session) throw new Error('Unauthenticated')
const { businessId, role } = session.user
```

### API Key Protection

- `ANTHROPIC_API_KEY` lives in `.env.local` / Vercel env vars — never in client code
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never in browser
- No secret of any kind in `.client.tsx` files, `NEXT_PUBLIC_` vars, or Dexie

### AI Prompt Injection Protection

The AI API Route (`/api/ai/chat`) injects `businessId` from the session
server-side. It is never a parameter Claude fills in from user input.

```typescript
// /api/ai/chat/route.ts
const session = await getServerSession()
const businessId = session.user.businessId // from session — never from req.body
const result = await runAIWithTools(userMessage, { businessId })
```

Log any user message matching these patterns to
`ai_conversation_logs.requiresReview = true`:

- "ignore previous instructions"
- "show me" + any business_id reference
- "system prompt"
- "other business"

### Row-Level Security

RLS is enabled on all Supabase tables. It is the defence-in-depth layer —
not the primary enforcement mechanism. The primary enforcement is the
`businessId` filter on every Drizzle query. RLS catches bugs in that layer.

### RBAC

Check `session.user.role` in Server Actions where the operation is
restricted. Roles: `owner | manager | accountant | cashier`.

```typescript
if (role !== 'owner' && role !== 'manager') {
  throw new Error('Insufficient permissions')
}
```

---

## 8. AI Assistant Architecture

The AI assistant uses Claude via the Anthropic API with tool-use.
It is a natural language interface to the application — not a chatbot.

### Staging Flow (Non-Negotiable)

The AI never writes directly to transaction tables.

1. AI proposes an action → written to `pending_ai_actions` (status: pending)
2. User sees a Confirmation Card with `humanReadable` summary
3. User confirms → Server Action promotes to actual tables
4. User rejects → status: rejected, nothing posted to ledger
5. No response within 30 minutes → status: expired

### Reversal Flow

AI-recorded transactions that are wrong must be reversed — not deleted.
Reversal posts an equal and opposite journal entry with:

- `sourceType = 'reversal'`
- `reversalOf = original journalEntryId`

Both entries remain in the ledger permanently.

---

## 9. Data Integrity

### Reconciliation Job

`runLedgerReconciliation(businessId)` detects:

1. Fulfilled orders with no `journalEntryId`
2. Confirmed expenses with no `journalEntryId`
3. Confirmed GRNs with no `journalEntryId`
4. Journal entries where `SUM(debit) ≠ SUM(credit)`

All issues written to `ledger_integrity_log`. Runs on app load after sync
and on demand from the accountant dashboard.

### Resolution Actions

- Missing journal entry: re-post from source record data (idempotent)
- Debit/credit mismatch: flag for manual review — never auto-correct

---

## 10. Performance Targets

| Metric                           | Target      |
| -------------------------------- | ----------- |
| Dashboard load (from IndexedDB)  | < 1 second  |
| Transaction write (to IndexedDB) | < 200ms     |
| Report generation (12 months)    | < 3 seconds |
| Invoice PDF generation           | < 2 seconds |
| AI assistant response            | < 5 seconds |
| Initial bundle size              | < 5MB       |

PDF generation runs in a Web Worker — never on the main thread.
Route-based code splitting is automatic in Next.js — payroll and reporting
modules are not loaded in the POS view.

---

## 11. Coding Standards

### TypeScript

- Strict mode enabled — no `any`, no `as unknown as`
- All Server Actions explicitly typed with input and return types
- All Drizzle query results typed via inferred schema types

### Naming

- Server Actions: `verbNoun` — `recordSale`, `postExpense`, `approvePayroll`
- Drizzle tables: `camelCase` in schema, `snake_case` in database
- Client Components: suffixed `.client.tsx`
- API Routes: `app/api/{resource}/route.ts`

### Error Handling

- Server Actions throw typed errors — never return `{ error: string }`
- Client Components catch Server Action errors and display user-facing messages
- Every async operation has an explicit error state in the UI
- Error messages are specific: "Phone number already exists" not "An error occurred"

### Monetary Arithmetic

Always use `numeric` strings from Drizzle — convert to `number` only for
display. Never use floating-point arithmetic for financial calculations.
Round to 2 decimal places at the final step, not intermediate steps.

```typescript
// CORRECT
const tax = Math.round(supplyAmount * rate * 100) / 100

// WRONG
const tax = supplyAmount * 0.219 // floating point error accumulates
```

### Testing

Every function in `src/lib/` has corresponding tests in `src/lib/__tests__/`.
The following tests must always pass — they are the ledger health check:

1. postJournalEntry with balanced lines → succeeds
2. postJournalEntry with imbalanced lines → throws before writing
3. calculateTax(businessId, 100) → totalTaxAmount ≈ 21.90 (Ghana cascading)
4. runLedgerReconciliation detects orphaned order → appears in integrity log
5. Trial Balance across all test entries → SUM(debits) = SUM(credits)

---

## 12. What Not to Do

These are the most common agent mistakes on this codebase. Treat this list
as a checklist before submitting any code.

| Action                                                | Why It's Wrong                     |
| ----------------------------------------------------- | ---------------------------------- |
| Import Drizzle in a `.client.tsx` file                | Drizzle is server-only             |
| Store account balance on the `accounts` table         | Balances are computed              |
| Hardcode `0.219` or any tax rate                      | Rates come from `tax_components`   |
| Use `businessId` from request body in a Server Action | Security hole                      |
| Write to `orders` without `atomicTransactionWrite`    | Creates orphan records             |
| Use `float` or `integer` for monetary amounts         | Precision loss                     |
| Write directly to transaction tables from the AI      | Must stage in `pending_ai_actions` |
| Delete a journal entry                                | Always reverse — never delete      |
| Use `fx_rates` to look up a past transaction's rate   | Rates are locked at post time      |
| Use `NEXT_PUBLIC_` prefix for any secret              | Exposed to browser                 |
| Generate sequential IDs locally without device prefix | Offline collision risk             |
| Derive stock quantity from a stored field             | Query `inventory_transactions`     |

---

## 13. Sprint Reference

| Sprint | Focus                                                                 |
| ------ | --------------------------------------------------------------------- |
| 1 ✓    | Foundation — schema, auth, journal engine, tax engine, General Ledger |
| 2      | Onboarding — setup wizard, opening balances, CSV import               |
| 3      | Core Sales — orders, invoices, FX rate locking                        |
| 4      | Expenses — recording, receipts, basic dashboard                       |
| 5      | Inventory — products, FIFO stock movements                            |
| 6      | Suppliers — purchase orders, GRNs, payables                           |
| 7      | Reporting — P&L, Balance Sheet, Cash Flow, Trial Balance, VAT         |
| 8      | AI Assistant — tool-use, staging flow, reversal                       |
| 9      | Offline Sync — Dexie → Supabase sync engine                           |
| 10     | MoMo & WhatsApp — payment integration, notifications                  |
| 11     | Payroll & Tax — payroll run, depreciation, GRA compliance             |
| 12     | Polish & Beta — performance, error handling, pilot users              |
| 13     | Feedback Loop — AI refinement, pilot fixes                            |

Build vertically. Complete one sprint fully before starting the next.
