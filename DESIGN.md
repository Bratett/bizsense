# BizSense Ghana — UI Design Prompt

---

## Product Overview

Design the complete UI for **BizSense Ghana** — an offline-first, AI-native Progressive Web App for Ghanaian small businesses (1–20 employees). The product helps SME owners manage sales, expenses, inventory, customers, suppliers, payroll, and financial reporting from their phone.

This is a **production UI**, not a prototype. Every screen must be implementation-ready, component-consistent, and usable in the field by a non-technical business owner in Ghana.

---

## Design Context — Read This Before Designing Anything

### Who Is the User

A Ghanaian SME owner or staff member. Primary examples:
- A rice and provisions trader in Kumasi Market
- A small clothing boutique owner in Accra
- A food vendor with 3 staff members in Tema
- An accountant reviewing books for a client

They are not accountants. They do not think in double-entry terms. They understand: "money in," "money out," "who owes me," "who I owe," "what's left." Language must reflect this throughout the UI. Never use accounting jargon where a plain business phrase works.

### Primary Device

**Android smartphone** — Samsung, Tecno, Itel, Infinix. Screen width 375–414px. The entire product must be designed mobile-first. Every screen must be fully functional on a 375px wide viewport with one hand. Desktop layout is an enhancement, not the baseline.

### Offline Reality

The app works offline. Status indicators must communicate sync state clearly without being alarming. When data is local-only (not yet synced), show a subtle indicator — not a blocking error. Users in areas with patchy coverage should feel confident the app is working, not broken.

### Cultural Context

- **Currency:** GHS (Ghana Cedi) is primary. Display as: GHS 1,250.00 (comma as thousands separator, two decimal places). USD appears as secondary where relevant.
- **Date format:** DD/MM/YYYY throughout — never MM/DD/YYYY.
- **Payment methods:** Cash, MTN MoMo, Telecel Cash, AirtelTigo Money, Bank Transfer. MoMo must appear as a first-class option everywhere — not buried in a dropdown.
- **Names:** Ghanaian names are common (Kofi, Ama, Kwame, Abena, Mensah). Use these in all example/placeholder text, never "John Smith" or "Jane Doe."
- **Language:** English (Ghana). Friendly, direct, business-focused tone. Not formal, not casual.

---

## Design System

### Colour Palette

**Primary:** Deep Forest Green `#00704A`
Rationale: Green communicates money, growth, and trust. Anchors the brand.

**Primary Dark:** `#005538`
Used for: active states, pressed states, dark header backgrounds.

**Primary Light:** `#E8F5EF`
Used for: selected row backgrounds, success states, subtle highlights.

**Accent:** Gold `#F5A623`
Used for: pending states, amber alerts, MoMo payment indicators.

**Danger:** `#D93025`
Used for: overdue invoices, negative balances, destructive actions, errors.

**Warning:** `#F29900`
Used for: low stock alerts, approaching limits, caution states.

**Neutral Scale:**
- `#111827` — primary text
- `#374151` — secondary text
- `#6B7280` — placeholder / hint text
- `#D1D5DB` — borders, dividers
- `#F3F4F6` — table row alternate, input backgrounds
- `#FFFFFF` — card backgrounds, page background

**Semantic Colours:**
- Paid / In Stock / Positive: `#00704A` (primary green)
- Pending / Partial: `#F5A623` (gold)
- Overdue / Critical / Negative: `#D93025` (danger red)
- Draft / Inactive: `#6B7280` (neutral grey)

### Typography

**Font family:** Inter (Google Fonts)
- Headings: Inter SemiBold (600)
- Body: Inter Regular (400)
- Numbers/amounts: Inter Medium (500), tabular numbers (`font-variant-numeric: tabular-nums`)
- Monospace (ledger/codes): JetBrains Mono

**Type scale (mobile):**
- Page title: 20px / 600
- Section header: 16px / 600
- Body: 14px / 400
- Small / caption: 12px / 400
- Metric display (large numbers on dashboard): 28px / 600

**Amount display rule:** All GHS amounts are right-aligned, monospace, tabular. Never left-align monetary figures.

### Spacing

Base unit: 4px. Use multiples: 4, 8, 12, 16, 20, 24, 32, 48.
Card padding: 16px. List item padding: 12px vertical, 16px horizontal.
Screen edge padding: 16px.

### Elevation / Depth

Use subtle shadow, not heavy drop shadows. Cards: `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`. Modals/sheets: `box-shadow: 0 4px 24px rgba(0,0,0,0.15)`.

### Component Defaults

**Buttons:**
- Primary: Green fill `#00704A`, white text, 48px height, 8px border-radius, full-width on mobile
- Secondary: White fill, green border `#00704A`, green text
- Destructive: Red fill `#D93025`, white text
- Ghost/link: No border, green text, no background
- Disabled: `#D1D5DB` fill, `#9CA3AF` text
- Minimum touch target: 44×44px — never smaller

**Inputs:**
- Height: 48px on mobile (large enough to tap comfortably)
- Border: 1px `#D1D5DB`, 8px border-radius
- Focus: 2px green border `#00704A`
- Error: 1px red border `#D93025`, red helper text below
- Numeric inputs: `inputMode="decimal"` triggers numeric keyboard on Android
- Phone inputs: `inputMode="tel"`
- Label: 14px, above the input, never placeholder-only

**Cards:**
- White background, 12px border-radius, 1px border `#E5E7EB`, 16px padding
- Tappable cards: show pressed state (slight grey fill) on tap

**Bottom Navigation (mobile):**
5 items maximum. Icons with labels. Active item uses primary green. Height 60px. Safe area at bottom for modern Android notches.

**Status Badges / Pills:**
- Paid: green fill light `#E8F5EF`, green text `#00704A`
- Pending: gold fill light `#FEF3C7`, gold text `#B45309`
- Overdue: red fill light `#FEE2E2`, red text `#DC2626`
- Draft: grey fill `#F3F4F6`, grey text `#6B7280`
- AI-generated: indigo fill light `#EEF2FF`, indigo text `#4338CA`
- Reversal: amber fill, amber text

**Lists:**
Dividers between rows: 1px `#F3F4F6`. No divider after last item. Row height minimum 56px. Swipe-to-reveal actions (edit, delete) on list rows where relevant.

**Empty States:**
Every list or table that can be empty must have an empty state. Center-aligned. Icon (outline style, 48px). Title in 16px SemiBold. Subtitle in 14px grey. Primary action button below.

**Loading States:**
Skeleton loaders for lists and cards. Spinner for form submissions. Never a blank white screen.

**Sync Indicator:**
Persistent but subtle. Small dot in the header or status bar area:
- Green dot: synced
- Amber dot + "Syncing..." text: sync in progress
- Grey dot + "Offline": no connectivity (not alarming — the app still works)

---

## Navigation Structure

### Mobile Bottom Navigation (5 tabs)

1. **Home** (dashboard icon) → Dashboard
2. **Sales** (receipt icon) → Sales list + New Sale FAB
3. **Expenses** (wallet icon) → Expenses list + New Expense FAB
4. **Customers** (people icon) → Customer list
5. **More** (grid icon) → Inventory, Suppliers, Reports, Payroll, Settings, General Ledger

### Floating Action Button (FAB)

On Sales, Expenses, Customers, Inventory, and Suppliers screens: a green FAB in the bottom-right corner. Icon matches the primary action for that screen (e.g., "+" for new sale). FAB sits above the bottom navigation bar.

### AI Assistant

Persistent entry point. A circular chat bubble button, green, fixed to the bottom-right of every screen (above the FAB if FAB exists, or in FAB position if no FAB). Tapping it opens the AI assistant sheet.

### Header

- Left: hamburger (for drawer on some screens) OR back arrow
- Centre: screen title (16px SemiBold)
- Right: contextual actions (search, filter, more options)
- Background: white. Subtle 1px bottom border.
- No heavy gradients or coloured headers (except login/signup screens)

---

## Screens to Design

Design all of the following screens. Every screen must be shown in **375px mobile viewport** AND **1280px desktop viewport**.

---

### 1. Signup Screen

Fields: Full Name, Email, Password, Business Name, Phone (optional).
"Create Account" primary button (full width).
"Already have an account? Sign In" link below.
No header navigation. Centred layout with BizSense logo at top.
Password field has show/hide toggle.
Inline validation errors below each field (red text, specific messages).
Loading state on button while submitting.

---

### 2. Login Screen

Fields: Email, Password.
"Sign In" primary button.
"Forgot password?" ghost link.
"Don't have an account? Create one" link.
Same layout as signup.

---

### 3. Onboarding Wizard — All 6 Steps

Show all 6 steps as separate screens. Each step has:
- Progress bar at top (e.g., "Step 2 of 6" with filled segments)
- Step title and subtitle in plain business language
- Input area (varies per step — see below)
- "Continue" full-width green button at bottom
- "Back" ghost link top-left (except Step 1)
- "Skip" grey text link top-right (Steps 3, 4, 5 only)

**Step 1 — Business Profile**
Fields: Business Name, Industry (dropdown), Location, Phone, Email, TIN (optional), "VAT Registered?" toggle (reveals VAT Number + Effective Date when on), Financial Year Start (dropdown), Logo upload (dashed upload zone with camera icon).

**Step 2 — Opening Cash & Bank**
Title: "What's your current cash position?"
Cards for each account type: Cash on Hand, MTN MoMo, Telecel Cash, AirtelTigo Money, Bank Account. Each card has an amount input with "GHS" prefix. "As of what date?" date picker below. "+ Add another bank" text link at bottom.

**Step 3 — Opening Stock (Optional)**
Title: "Do you have products or stock?"
Dynamic product list. Each row: Name, Unit (dropdown), Qty, Cost Price. "+ Add product" button. "Import from CSV" secondary button at top. Empty state if no products yet.

**Step 4 — Outstanding Invoices (Optional)**
Title: "Does anyone owe you money?"
Dynamic invoice list. Each row: Customer Name, Phone, Amount (GHS), Invoice Date, Due Date. "+ Add invoice" button. "Import from CSV" secondary button.

**Step 5 — Supplier Balances (Optional)**
Title: "Do you owe money to any suppliers?"
Dynamic payable list. Each row: Supplier Name, Phone, Amount (GHS), Due Date.

**Step 6 — Review & Confirm**
Summary card showing Opening Position: Cash & MoMo, Inventory Value, Receivables, Payables, Net Opening Equity.
Green success banner: "✓ Your books are balanced and ready." (or red error if imbalanced).
"Finish Setup" primary green button.

---

### 4. Dashboard

The most important screen. Everything visible without scrolling on mobile.

**Top section (white card):**
- Business name + "Good morning, [Name]" greeting
- Date: today's date in DD/MM/YYYY
- Sync status indicator (small, top right)

**4 metric tiles (2×2 grid):**
- Today's Sales: large GHS amount, green
- Cash Balance: large GHS amount, black
- Receivables: large GHS amount, amber if > 0
- Low Stock: count badge, red if > 0, green if 0

**Quick Actions (horizontal row, 4 buttons):**
"Record Sale" | "Record Expense" | "Receive Payment" | "Ask AI"
Icon + label, equal width, green icons, tappable cards.

**Alerts panel (if alerts exist):**
Compact list. Red row for overdue invoices. Amber row for low stock. Each row tappable.

**Activity Feed:**
"Recent Activity" section header.
Last 10 transactions. Each row:
- Left: transaction type icon (receipt for sale, wallet for expense, arrow for payment)
- Centre: description + customer/supplier name
- Right: amount (green for money in, red for money out)
- Below amount: date in DD/MM/YYYY, small grey text

**Revenue vs Expenses bar chart:**
7-day view. Green bars for revenue, red bars for expenses. Simple, no gridlines. Tappable to expand.

**Desktop layout:** Two-column. Left column: metrics + quick actions + alerts. Right column: activity feed + chart.

---

### 5. New Sale Screen

Step-by-step order creation flow on a single screen with progressive disclosure.

**Header:** "New Sale" with close (×) button.

**Section 1 — Customer**
Search field: "Customer name or phone..." with search icon.
Recent customers shown as tappable chips below (last 3 used).
"New customer" link if no match found.

**Section 2 — Items**
Each line item row:
- Product search field (autocomplete from product list)
- Quantity (numeric input, large)
- Unit price (GHS, pre-filled from product, editable)
- Line total (calculated, right-aligned, greyed out — not editable)
- Remove (×) button on right
"+ Add item" button below last row.

**Section 3 — Discount (expandable)**
"Add discount?" chevron toggle. Reveals: discount type (% or GHS fixed) + amount.

**Section 4 — Summary**
Subtotal, Discount, VAT (if applicable, greyed out label if not VAT-registered), Total. All right-aligned, monospace.

**Section 5 — Payment**
"How did they pay?" label.
Payment method selector: prominent pill buttons.
Cash | MTN MoMo | Telecel | AirtelTigo | Bank | Credit (pay later)
Each pill has an icon. Only one selectable at a time. MoMo options grouped visually.
If MoMo selected: show "MoMo Reference (optional)" text input.
If Credit selected: show amber banner "This will be recorded as an unpaid invoice."

**Footer (fixed):**
"Record Sale" full-width green button.
Total amount shown above the button: "Total: GHS 1,250.00"

---

### 6. Sales List Screen

Header: "Sales" with search icon and filter icon.

**Filter bar (horizontal scroll):** All | Today | This Week | This Month | Unpaid
Active filter: green pill.

**Each sale row:**
- Left: date (DD/MM/YYYY), grey, small
- Centre: customer name (bold) + order number (grey, small)
- Right: GHS amount (monospace) + payment status badge (Paid/Partial/Unpaid)
Tappable row → opens sale detail.

**Sale Detail (bottom sheet or new screen):**
Order number, date, customer name + phone.
Line items table: Product | Qty | Unit Price | Total.
Summary: Subtotal, Discount, VAT, Total Paid, Balance Due.
Payment method badge.
Action buttons: "Record Payment" (if unpaid), "Share Invoice" (WhatsApp icon), "Print/PDF."
If AI-generated: indigo "AI" badge near the order number.

---

### 7. New Expense Screen

**Header:** "New Expense" with close (×).

Fields:
- Date (date picker, default today)
- Category (large dropdown/select: Rent, Utilities, Transport & Fuel, Salaries, Marketing, Bank Charges, Repairs, Other)
- Amount (large GHS input, prominent)
- Description (text input)
- Payment method (same pill selector as New Sale)
- Supplier (optional search field, "Link to supplier")
- Receipt (dashed upload zone: "Tap to photograph receipt" with camera icon)

"Save Expense" full-width green button at bottom.

---

### 8. Customer List Screen

Header: "Customers" with search icon.

**Each customer row:**
- Avatar circle (initials, coloured by first letter)
- Customer name (bold)
- Phone number (grey, small)
- Right: outstanding balance (amber if > 0, grey "No balance" if 0)

Tappable → Customer Detail screen.

**Customer Detail:**
- Header: large initials avatar, name, phone, location
- Balance card: "Owes GHS X" in amber (or "All settled" in green)
- Tabs: Transactions | Details
- Transactions tab: chronological list of all orders and payments
- Action buttons: "Record Payment", "Send Reminder" (WhatsApp icon), "View Statement"
- Credit limit shown as progress bar if set: "GHS 800 of GHS 1,000 credit used"

---

### 9. Inventory Screen

Header: "Inventory" with search icon and filter icon.

**Filter bar:** All | Low Stock | Out of Stock | By Category

**Each product row:**
- Product name (bold)
- Category tag (grey pill)
- Right: current stock quantity + unit (e.g., "24 bags")
- Stock status: green dot if OK, amber if low, red if zero
- Cost price / selling price (small, grey)

Tappable → Product Detail.

**Product Detail:**
Name, SKU, category, unit.
Current stock: large number, colour-coded.
Cost price and selling price side by side.
Reorder level shown as progress bar.
"Stock History" section: chronological list of stock movements (in/out, date, reference).
Action buttons: "Adjust Stock", "Edit Product".

---

### 10. Record Expense — Quick Entry

A bottom sheet variant of the New Expense screen for ultra-fast entry.
Triggered from the dashboard Quick Actions.
Fields: Amount (prominent, large), Category (horizontal scroll chips), Payment method (pills), Description (one line).
"Save" button.
Takes 3 taps to record a common expense.

---

### 11. AI Assistant Screen

Full-screen chat interface opened as a bottom sheet that expands to full screen.

**Header:**
"BizSense AI" title. Green circular avatar with a sparkle icon. Close button (×).
Subtitle: "Tell me what happened and I'll record it."

**Chat area:**
User messages: right-aligned, green bubble.
AI messages: left-aligned, white bubble with subtle border.
System messages (confirmations): full-width card, slightly elevated.

**Confirmation Card (AI proposes an action):**
Displayed as a distinct card in the chat — not a bubble.
White card, green left border.
Title: "I'm about to record this:"
Content: plain-English summary of the proposed transaction.
Example:
  ┌─────────────────────────────────────┐
  │ 📝 Record Expense                    │
  │ Transport & Fuel — GHS 200.00        │
  │ Payment: Cash · Today, 10/04/2026    │
  ├─────────────────────────────────────┤
  │  ✓ Confirm       ✗ Cancel           │
  └─────────────────────────────────────┘
"Confirm" button: green. "Cancel" button: ghost/outline.

**Input area (fixed at bottom):**
Large text input: "What happened today?..."
Send button: green circle with arrow icon.
Voice input button (microphone icon) to the left of the text input.

**Example conversation visible in design:**
User: "I spent 200 cedis on fuel, paid cash"
AI: confirmation card as above
User taps Confirm
AI: "✓ Done. GHS 200 expense recorded under Transport & Fuel."

---

### 12. Reports Screen

Header: "Reports" with a period selector (This Month | Last Month | YTD | Custom).

**Report cards (tappable list):**
Each card shows: report name, icon, brief description.
- Profit & Loss — "Revenue vs expenses for the period"
- Balance Sheet — "Your assets, liabilities, and equity"
- Cash Flow — "Cash in and out by activity"
- Trial Balance — "Full ledger check"
- Receivables Aging — "Who owes you and for how long"
- Payables Aging — "What you owe and when it's due"
- Sales Report — "Sales by product, customer, or period"
- VAT Report — "Output and input VAT summary" (visible only if VAT-registered)

**P&L Report Screen (example of a report view):**
Period selector at top.
Sections: Revenue (collapsed/expandable), COGS, Gross Profit (highlighted), Expenses (collapsed/expandable), Net Profit (large, green if positive, red if negative).
Export buttons: PDF icon, CSV icon.
Compare toggle: "Compare to previous period."

---

### 13. Onboarding CSV Import Modal

Triggered from Steps 3, 4, or 5 of the onboarding wizard.
Full-screen modal on mobile.

**States to show:**

**State 1 — Prompt:**
Title: "Import Products from CSV"
Description of expected columns.
"Download template" button (outline, with download icon).
Large dashed upload zone: "Tap to select your CSV file" with upload cloud icon.

**State 2 — Preview (after file selected):**
File name shown with green checkmark.
Preview table showing first 5 rows of data.
Column headers matched (green tick if recognised, red × if unrecognised).
"Import 24 products" primary button.

**State 3 — Validation Errors:**
Red banner: "3 errors found. Fix them before importing."
Error list: each row shows "Row 4 — cost_price: Must be a number."
"Re-upload fixed file" button.

**State 4 — Success:**
Green checkmark animation.
"24 products imported successfully."
"Continue" button.

---

### 14. Payroll Screen

Header: "Payroll."

**Payroll Runs list:**
Each row: Month + Year (e.g., "April 2026"), status badge (Draft/Approved/Paid), total net amount.

**New Payroll Run:**
Period selector (month/year).
Staff list with calculated amounts:
Each row: Staff name | Gross | SSNIT | PAYE | Net.
Approve button (disabled for non-owners).
"Approve Payroll" confirmation modal with total summary.

---

### 15. Settings Screen

Section list (grouped):
**Business**
- Business Profile (name, logo, TIN, VAT number)
- Chart of Accounts
- Tax Settings (view/manage GRA levy rates)
- Financial Year

**Team**
- Users & Roles (invite staff, assign roles)

**Integrations**
- Mobile Money (account references)
- WhatsApp Notifications (toggle per notification type)

**Data**
- Export All Data (CSV)
- Sync Status (last synced timestamp, manual sync button)

**Account**
- Change Password
- Sign Out (red text, destructive style)

---

### 16. General Ledger Screen (Accountant / Developer View)

Header: "General Ledger." Visible to Owner and Accountant roles only.

**Two tabs:** Journal Entries | Trial Balance

**Journal Entries tab:**
Filter bar: date range, source type dropdown, "AI only" toggle, "Unbalanced only" toggle.
Each row: Date | Reference | Description | Source badge | Dr Total | Cr Total | Status (✓ or ✗)
Expandable row: tap to reveal all journal lines in a sub-table.
Sub-table columns: Account Code | Account Name | Dr | Cr | Memo.
AI-generated entries: indigo "AI" badge.
Reversal entries: amber "REVERSAL" badge.
Imbalanced entries: red row highlight.

**Trial Balance tab:**
Period selector.
Table: Code | Name | Type | Dr Total | Cr Total | Balance.
Grouped by account type with subtotals.
Footer: Grand Total Dr | Grand Total Credits.
Green banner if balanced. Red banner if not.

---

## UI Patterns and Interaction Notes

**Monetary input fields:**
Always show "GHS" as a fixed prefix label inside the field on the left. Right-align the typed amount. Large font (18–20px) for amount fields. Trigger numeric keyboard (`inputMode="decimal"`).

**Empty states:**
Every list must have one. Use outline icons (not filled). Title + subtitle + one primary action button. Example: empty sales list → receipt outline icon → "No sales yet" → "Record your first sale" button.

**Error states:**
Inline, below the field. Red text, 12px. Never replace the field with the error. Never use toast-only errors for form validation.

**Confirmation dialogs:**
Bottom sheet on mobile, centered modal on desktop. Title (bold), body text (grey), two buttons (Confirm / Cancel). Destructive confirmations use red Confirm button.

**Swipe actions on list rows:**
Swipe left to reveal: Edit (green), Delete (red). Standard Android/iOS gesture pattern.

**Pull to refresh:**
On all list screens. Standard spinner animation at top.

**Offline banner:**
When offline: subtle amber banner at very top of screen (below status bar): "Working offline — changes will sync when connected." Not blocking. Dismissible.

**Long press on amounts:**
Long-pressing a GHS amount in a list copies it to clipboard. Show a brief "Copied" toast.

**WhatsApp share:**
Wherever "Share via WhatsApp" appears, use the official WhatsApp green colour (`#25D366`) and the WhatsApp logo icon. This is a recognised brand element in Ghana.

---

## Output Requirements

For each screen, deliver:

1. **Mobile view** (375px width, full height, realistic content — not Lorem Ipsum)
2. **Desktop view** (1280px width, same content)
3. **Component states** where relevant: empty, loading (skeleton), populated, error
4. Use realistic Ghanaian data in all mockups:
   - Business name: "Mensah Provisions & General Store"
   - Owner: "Kwame Mensah"
   - Sample customers: Ama Asante, Kofi Boateng, Abena Owusu, Yaw Darko
   - Sample products: Rice 50kg Bag, Palm Oil 5L, Cooking Oil 2L, Tomato Paste Carton
   - Sample amounts in GHS: 1,250.00, 4,320.50, 75.00, 12,000.00
   - Sample MoMo references: MTN-2024-89123, GHS amounts like 500.00

5. All text must be final copy — no placeholder text except inside input fields where it is intentionally a hint.

6. Tailwind CSS class names annotated on components where non-obvious, so the coding agent can implement directly.

---

## What Not to Design

- No heavy gradients or dark/neon colour schemes
- No skeuomorphic textures or shadows heavier than specified
- No card-within-card-within-card nesting (max 2 levels of elevation)
- No animations described — static screens only
- No hamburger menus as primary navigation (use bottom nav)
- No tables that require horizontal scrolling on mobile — reformat as cards or stacked rows
- No accounting jargon in UI copy ("Dr/Cr", "ledger entry", "journal") — except in the General Ledger view which is explicitly for accountants
- No blue links (this is not a web page) — actions are buttons or tappable rows
- No disabled states without a visible reason — if a button is disabled, show why

---

## Design Deliverable Priority Order

If generating in sequence, prioritise in this order:

1. Dashboard (most important — sets the visual language)
2. New Sale screen
3. AI Assistant screen
4. Onboarding Wizard (all 6 steps)
5. Customer List + Customer Detail
6. Sales List + Sale Detail
7. New Expense
8. Inventory screen
9. Reports screen + P&L report
10. General Ledger
11. Signup + Login
12. Settings
13. Payroll
14. CSV Import modal
