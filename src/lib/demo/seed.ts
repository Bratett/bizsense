/**
 * seedDemoData — populates a fresh account with 3 months of realistic
 * Ghanaian SME data for the "Ama Traders" demo business.
 *
 * CAUTION: This uses the same core lib functions (atomicTransactionWrite,
 * postJournalEntry) that production code uses. If this seeder produces
 * an imbalanced Trial Balance, the underlying code has a bug.
 *
 * Only callable when DEMO_MODE=true. Guards against double-seeding.
 */

import { and, count, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import {
  accounts,
  businesses,
  customers,
  expenses,
  fixedAssets,
  inventoryTransactions,
  orderLines,
  orders,
  payeBands,
  payrollLines,
  payrollRuns,
  products,
  staff,
  suppliers,
} from '@/db/schema'
import { postJournalEntry } from '@/lib/ledger'
import { atomicTransactionWrite } from '@/lib/atomic'
import { runLedgerReconciliation } from '@/lib/reconciliation'
import { seedChartOfAccounts } from '@/lib/seeds/seedChartOfAccounts'
import { seedPayeBands } from '@/lib/seeds/seedPayeBands'
import {
  computePayrollDeductions,
  SSNIT_EMPLOYEE_RATE,
  SSNIT_EMPLOYER_RATE,
  type PayeBand,
} from '@/lib/payroll/paye'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

type AccountMap = Record<string, string> // account code → UUID

// ─── Seed data constants ─────────────────────────────────────────────────────

const DEMO_PRODUCTS = [
  {
    name: 'Rice (50kg bag)',
    sku: 'RICE-50',
    category: 'Grains',
    unit: 'bag',
    cost: 280,
    selling: 350,
    openingQty: 40,
    reorderLevel: 20,
  },
  {
    name: 'Palm Oil (1L)',
    sku: 'OIL-1L',
    category: 'Cooking',
    unit: 'litre',
    cost: 18,
    selling: 25,
    openingQty: 100,
    reorderLevel: 30,
  },
  {
    name: 'Coca-Cola (24-can case)',
    sku: 'COKE-24',
    category: 'Beverages',
    unit: 'case',
    cost: 42,
    selling: 55,
    openingQty: 60,
    reorderLevel: 15,
  },
  {
    name: 'Fanta (24-can case)',
    sku: 'FANTA-24',
    category: 'Beverages',
    unit: 'case',
    cost: 40,
    selling: 52,
    openingQty: 45,
    reorderLevel: 15,
  },
  {
    name: 'Sugar (1kg)',
    sku: 'SUGAR-1K',
    category: 'Grains',
    unit: 'kg',
    cost: 6.5,
    selling: 9,
    openingQty: 150,
    reorderLevel: 40,
  },
  {
    name: 'Flour (1kg)',
    sku: 'FLOUR-1K',
    category: 'Grains',
    unit: 'kg',
    cost: 5,
    selling: 7,
    openingQty: 80,
    reorderLevel: 25,
  },
  {
    name: 'Milo (400g tin)',
    sku: 'MILO-400',
    category: 'Beverages',
    unit: 'piece',
    cost: 24,
    selling: 32,
    openingQty: 15,
    reorderLevel: 20,
  },
  {
    name: 'Sprite (24-can case)',
    sku: 'SPRITE-24',
    category: 'Beverages',
    unit: 'case',
    cost: 40,
    selling: 52,
    openingQty: 18,
    reorderLevel: 25,
  },
] as const

const DEMO_CUSTOMERS = [
  { name: 'Akosua Asante', phone: '0244123456', location: 'Tema' },
  { name: 'Kweku Mensah', phone: '0554567890', location: 'Accra' },
  { name: 'Abena Otchere', phone: '0201234567', location: 'Tema' },
  { name: 'Yaw Boateng', phone: '0246789012', location: 'Tema' },
  { name: 'Adwoa Sarpong', phone: '0277890123', location: 'Accra' },
  { name: 'Kofi Frimpong', phone: '0244901234', location: 'Tema' },
  { name: 'Ama Gyimah', phone: '0559012345', location: 'Accra' },
  { name: 'Kwame Darko', phone: '0201123456', location: 'Tema' },
  { name: 'Adjoa Tetteh', phone: '0244234567', location: 'Tema' },
  { name: 'Nana Owusu', phone: '0277345678', location: 'Accra' },
  { name: 'Efua Quaye', phone: '0554456789', location: 'Tema' },
  { name: 'Kojo Ankrah', phone: '0201567890', location: 'Accra' },
  { name: 'Akua Bediako', phone: '0246678901', location: 'Tema' },
  { name: 'Fiifi Quartey', phone: '0559789012', location: 'Accra' },
  { name: 'Serwa Aidoo', phone: '0244890123', location: 'Tema' },
] as const

const DEMO_SUPPLIERS = [
  { name: 'Tema Food Wholesale Ltd', phone: '0302123456', owed: 1200 },
  { name: 'Accra Distributors & Co', phone: '0302234567', owed: 800 },
  { name: 'Ghana Beverages Depot', phone: '0302345678', owed: 500 },
] as const

const DEMO_STAFF = [
  { fullName: 'Abena Mensah', roleTitle: 'Cashier', baseSalary: 1200 },
  { fullName: 'Kwame Asante', roleTitle: 'Driver', baseSalary: 950 },
] as const

// 30 order templates per month: [customerIdx, [{productIdx, qty}], paymentMethod]
// Cash orders: 21, Credit orders: 9. Products chosen to ensure low stock on Milo + Sprite at month 3.
type OrderLine = { productIdx: number; qty: number }
type OrderTemplate = {
  customerIdx: number
  lines: OrderLine[]
  payMethod: 'cash' | 'momo' | 'credit'
}

const MONTHLY_ORDERS: OrderTemplate[] = [
  {
    customerIdx: 0,
    lines: [
      { productIdx: 0, qty: 2 },
      { productIdx: 4, qty: 10 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 1, lines: [{ productIdx: 2, qty: 3 }], payMethod: 'cash' },
  {
    customerIdx: 2,
    lines: [
      { productIdx: 1, qty: 5 },
      { productIdx: 5, qty: 8 },
    ],
    payMethod: 'momo',
  },
  { customerIdx: 3, lines: [{ productIdx: 0, qty: 1 }], payMethod: 'credit' },
  {
    customerIdx: 4,
    lines: [
      { productIdx: 3, qty: 2 },
      { productIdx: 4, qty: 15 },
    ],
    payMethod: 'cash',
  },
  {
    customerIdx: 5,
    lines: [
      { productIdx: 2, qty: 2 },
      { productIdx: 3, qty: 2 },
    ],
    payMethod: 'cash',
  },
  {
    customerIdx: 6,
    lines: [
      { productIdx: 6, qty: 1 },
      { productIdx: 1, qty: 4 },
    ],
    payMethod: 'momo',
  },
  { customerIdx: 7, lines: [{ productIdx: 0, qty: 3 }], payMethod: 'credit' },
  {
    customerIdx: 8,
    lines: [
      { productIdx: 4, qty: 20 },
      { productIdx: 5, qty: 10 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 9, lines: [{ productIdx: 7, qty: 2 }], payMethod: 'cash' },
  { customerIdx: 10, lines: [{ productIdx: 1, qty: 6 }], payMethod: 'momo' },
  {
    customerIdx: 11,
    lines: [
      { productIdx: 0, qty: 2 },
      { productIdx: 2, qty: 1 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 12, lines: [{ productIdx: 3, qty: 3 }], payMethod: 'credit' },
  { customerIdx: 13, lines: [{ productIdx: 5, qty: 5 }], payMethod: 'cash' },
  { customerIdx: 14, lines: [{ productIdx: 6, qty: 1 }], payMethod: 'momo' },
  {
    customerIdx: 0,
    lines: [
      { productIdx: 4, qty: 10 },
      { productIdx: 1, qty: 3 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 1, lines: [{ productIdx: 7, qty: 2 }], payMethod: 'credit' },
  {
    customerIdx: 2,
    lines: [
      { productIdx: 0, qty: 1 },
      { productIdx: 3, qty: 1 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 3, lines: [{ productIdx: 2, qty: 2 }], payMethod: 'cash' },
  { customerIdx: 4, lines: [{ productIdx: 5, qty: 8 }], payMethod: 'momo' },
  { customerIdx: 5, lines: [{ productIdx: 1, qty: 5 }], payMethod: 'cash' },
  { customerIdx: 6, lines: [{ productIdx: 0, qty: 2 }], payMethod: 'credit' },
  { customerIdx: 7, lines: [{ productIdx: 4, qty: 12 }], payMethod: 'cash' },
  {
    customerIdx: 8,
    lines: [
      { productIdx: 3, qty: 2 },
      { productIdx: 6, qty: 1 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 9, lines: [{ productIdx: 2, qty: 3 }], payMethod: 'momo' },
  { customerIdx: 10, lines: [{ productIdx: 5, qty: 6 }], payMethod: 'cash' },
  { customerIdx: 11, lines: [{ productIdx: 0, qty: 1 }], payMethod: 'credit' },
  {
    customerIdx: 12,
    lines: [
      { productIdx: 1, qty: 4 },
      { productIdx: 4, qty: 8 },
    ],
    payMethod: 'cash',
  },
  { customerIdx: 13, lines: [{ productIdx: 7, qty: 1 }], payMethod: 'cash' },
  { customerIdx: 14, lines: [{ productIdx: 3, qty: 2 }], payMethod: 'momo' },
]

// 10 expense templates per month
type ExpenseTemplate = { description: string; accountCode: string; amount: number; payCode: string }
const MONTHLY_EXPENSES: ExpenseTemplate[] = [
  { description: 'Shop rent — monthly', accountCode: '6002', amount: 800, payCode: '1001' },
  { description: 'Fuel for deliveries', accountCode: '6004', amount: 150, payCode: '1002' },
  { description: 'Electricity bill', accountCode: '6003', amount: 200, payCode: '1001' },
  { description: 'Water bill', accountCode: '6003', amount: 80, payCode: '1001' },
  { description: 'Facebook & radio ads', accountCode: '6005', amount: 300, payCode: '1002' },
  { description: 'Mobile data bundles', accountCode: '6009', amount: 50, payCode: '1002' },
  { description: 'Packaging materials', accountCode: '6009', amount: 120, payCode: '1001' },
  { description: 'Cleaning supplies', accountCode: '6009', amount: 60, payCode: '1001' },
  { description: 'Bank charges', accountCode: '6006', amount: 30, payCode: '1001' },
  { description: 'Miscellaneous expenses', accountCode: '6009', amount: 80, payCode: '1001' },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────

function firstOfMonthsAgo(n: number): Date {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

// ─── Account map helper ───────────────────────────────────────────────────────

async function buildAccountMap(businessId: string): Promise<AccountMap> {
  const rows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(eq(accounts.businessId, businessId))
  return Object.fromEntries(rows.map((r) => [r.code, r.id]))
}

// ─── PAYE band helper ─────────────────────────────────────────────────────────

async function fetchPayeBandsForBusiness(businessId: string): Promise<PayeBand[]> {
  const rows = await db
    .select({
      lowerBound: payeBands.lowerBound,
      upperBound: payeBands.upperBound,
      rate: payeBands.rate,
    })
    .from(payeBands)
    .where(and(eq(payeBands.businessId, businessId), isNull(payeBands.effectiveTo)))
    .orderBy(payeBands.lowerBound)
  return rows.map((r) => ({
    lowerBound: Number(r.lowerBound),
    upperBound: r.upperBound !== null ? Number(r.upperBound) : null,
    rate: Number(r.rate),
  }))
}

// ─── Main seeder ──────────────────────────────────────────────────────────────

export async function seedDemoData(businessId: string, userId: string): Promise<void> {
  // ── 1. Idempotency guard ────────────────────────────────────────────────────
  const [{ orderCount }] = await db
    .select({ orderCount: count(orders.id) })
    .from(orders)
    .where(eq(orders.businessId, businessId))

  if (Number(orderCount) > 0) {
    throw new Error(
      'This account already has transaction data. Demo seeder only works on a fresh account.',
    )
  }

  // ── 2. Ensure Chart of Accounts + PAYE bands are seeded ───────────────────
  await db.transaction(async (tx) => {
    const seeded = await seedChartOfAccounts(tx, businessId)
    await seedPayeBands(tx, businessId)
    // Persist seededAccountIds so getBusinessWithAccounts() works downstream
    await tx
      .update(businesses)
      .set({ seededAccountIds: seeded, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
  })

  const acctMap = await buildAccountMap(businessId)
  const openingDate = firstOfMonthsAgo(3)
  const openingDateStr = toDateStr(openingDate)

  // ── 3. Update business to "Ama Traders" ────────────────────────────────────
  await db
    .update(businesses)
    .set({
      name: 'Ama Traders',
      industry: 'Trading',
      address: 'Tema Community 5, Greater Accra',
      phone: '0302456789',
      vatRegistered: true,
      openingBalanceDate: openingDateStr,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))

  // ── 4. Opening cash balances ───────────────────────────────────────────────
  // Dr 1001 Cash 2,000 / Dr 1002 MTN MoMo 8,000 / Cr 3001 Owner's Equity 10,000
  await db.transaction(async (tx) => {
    for (const [code, amount] of [
      ['1001', 2000],
      ['1002', 8000],
    ] as const) {
      await postJournalEntry(tx, {
        businessId,
        entryDate: openingDateStr,
        reference: 'OB-CASH',
        description: `Opening balance — ${code === '1001' ? 'Cash on Hand' : 'MTN MoMo Account'}`,
        sourceType: 'opening_balance',
        createdBy: userId,
        lines: [
          { accountId: acctMap[code], debitAmount: amount, creditAmount: 0 },
          { accountId: acctMap['3001'], debitAmount: 0, creditAmount: amount },
        ],
      })
    }
  })

  // ── 5. Products + opening inventory ───────────────────────────────────────
  const productIds: string[] = []

  await db.transaction(async (tx) => {
    let totalInventoryValue = 0

    for (const p of DEMO_PRODUCTS) {
      const costStr = p.cost.toFixed(2)
      const sellingStr = p.selling.toFixed(2)

      const [product] = await tx
        .insert(products)
        .values({
          businessId,
          name: p.name,
          sku: p.sku,
          category: p.category,
          unit: p.unit,
          costPrice: costStr,
          sellingPrice: sellingStr,
          trackInventory: true,
          reorderLevel: p.reorderLevel,
        })
        .returning({ id: products.id })

      productIds.push(product.id)

      // Opening inventory transaction
      await tx.insert(inventoryTransactions).values({
        businessId,
        productId: product.id,
        transactionType: 'opening',
        quantity: p.openingQty.toFixed(2),
        unitCost: costStr,
        transactionDate: openingDateStr,
        notes: 'Opening stock — demo data',
      })

      totalInventoryValue += Math.round(p.openingQty * p.cost * 100) / 100
    }

    // One journal entry for total opening inventory
    // Dr 1200 Inventory / Cr 3001 Owner's Equity
    const invTotal = Math.round(totalInventoryValue * 100) / 100
    await postJournalEntry(tx, {
      businessId,
      entryDate: openingDateStr,
      reference: 'OB-INVENTORY',
      description: `Opening stock — ${DEMO_PRODUCTS.length} products`,
      sourceType: 'opening_balance',
      createdBy: userId,
      lines: [
        { accountId: acctMap['1200'], debitAmount: invTotal, creditAmount: 0 },
        { accountId: acctMap['3001'], debitAmount: 0, creditAmount: invTotal },
      ],
    })
  })

  // ── 6. Customers ──────────────────────────────────────────────────────────
  const customerIds: string[] = []

  const customerRows = await db
    .insert(customers)
    .values(
      DEMO_CUSTOMERS.map((c) => ({
        businessId,
        name: c.name,
        phone: c.phone,
        location: c.location,
      })),
    )
    .returning({ id: customers.id })

  for (const row of customerRows) {
    customerIds.push(row.id)
  }

  // ── 7. Suppliers + opening payables ──────────────────────────────────────
  await db.transaction(async (tx) => {
    for (let i = 0; i < DEMO_SUPPLIERS.length; i++) {
      const s = DEMO_SUPPLIERS[i]
      const amount = s.owed

      await tx.insert(suppliers).values({
        businessId,
        name: s.name,
        phone: s.phone,
      })

      // Dr 2101 Opening Balance Adjustment / Cr 2001 Accounts Payable
      await postJournalEntry(tx, {
        businessId,
        entryDate: openingDateStr,
        reference: `OB-AP-${i + 1}`,
        description: `Opening payable — ${s.name}`,
        sourceType: 'opening_balance',
        createdBy: userId,
        lines: [
          { accountId: acctMap['2101'], debitAmount: amount, creditAmount: 0 },
          { accountId: acctMap['2001'], debitAmount: 0, creditAmount: amount },
        ],
      })
    }
  })

  // ── 8. Orders (3 months × 30 orders) ─────────────────────────────────────
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const monthStart = firstOfMonthsAgo(2 - monthOffset) // months: 2 ago, 1 ago, current
    let orderSeq = monthOffset * 30 + 1

    for (let i = 0; i < MONTHLY_ORDERS.length; i++) {
      const tmpl = MONTHLY_ORDERS[i]
      const orderDate = addDays(monthStart, Math.floor((i / 30) * 28) + 1)
      const orderDateStr = toDateStr(orderDate)

      // Compute order totals
      let revenueTotal = 0
      let cogsTotal = 0
      for (const line of tmpl.lines) {
        const prod = DEMO_PRODUCTS[line.productIdx]
        revenueTotal = Math.round((revenueTotal + prod.selling * line.qty) * 100) / 100
        cogsTotal = Math.round((cogsTotal + prod.cost * line.qty) * 100) / 100
      }

      // Determine debit account for revenue
      const debitAccountId =
        tmpl.payMethod === 'credit'
          ? acctMap['1100'] // Accounts Receivable
          : tmpl.payMethod === 'momo'
            ? acctMap['1002'] // MTN MoMo
            : acctMap['1001'] // Cash on Hand

      const paymentStatus = tmpl.payMethod === 'credit' ? 'unpaid' : 'paid'
      const amountPaid = tmpl.payMethod === 'credit' ? 0 : revenueTotal
      const orderNumber = `ORD-${String(orderSeq++).padStart(4, '0')}`

      // Build journal lines: revenue + COGS
      const journalLines = [
        {
          accountId: debitAccountId,
          debitAmount: revenueTotal,
          creditAmount: 0,
          memo: `Sales — ${orderNumber}`,
        },
        {
          accountId: acctMap['4001'],
          debitAmount: 0,
          creditAmount: revenueTotal,
          memo: `Revenue — ${orderNumber}`,
        },
        {
          accountId: acctMap['5001'],
          debitAmount: cogsTotal,
          creditAmount: 0,
          memo: `COGS — ${orderNumber}`,
        },
        {
          accountId: acctMap['1200'],
          debitAmount: 0,
          creditAmount: cogsTotal,
          memo: `Inventory — ${orderNumber}`,
        },
      ]

      await atomicTransactionWrite(
        {
          businessId,
          entryDate: orderDateStr,
          reference: orderNumber,
          description: `Sale — ${DEMO_CUSTOMERS[tmpl.customerIdx].name}`,
          sourceType: 'order',
          createdBy: userId,
          lines: journalLines,
        },
        async (tx, journalEntryId) => {
          const [order] = await tx
            .insert(orders)
            .values({
              businessId,
              orderNumber,
              customerId: customerIds[tmpl.customerIdx],
              orderDate: orderDateStr,
              status: 'fulfilled',
              paymentStatus,
              subtotal: revenueTotal.toFixed(2),
              totalAmount: revenueTotal.toFixed(2),
              amountPaid: amountPaid.toFixed(2),
              journalEntryId,
              createdBy: userId,
            })
            .returning({ id: orders.id })

          for (const line of tmpl.lines) {
            const prod = DEMO_PRODUCTS[line.productIdx]
            const lineTotal = Math.round(prod.selling * line.qty * 100) / 100

            await tx.insert(orderLines).values({
              orderId: order.id,
              productId: productIds[line.productIdx],
              description: prod.name,
              quantity: line.qty.toFixed(2),
              unitPrice: prod.selling.toFixed(2),
              lineTotal: lineTotal.toFixed(2),
            })

            await tx.insert(inventoryTransactions).values({
              businessId,
              productId: productIds[line.productIdx],
              transactionType: 'sale',
              quantity: (-line.qty).toFixed(2),
              unitCost: prod.cost.toFixed(2),
              referenceId: order.id,
              transactionDate: orderDateStr,
            })
          }

          return order
        },
      )
    }
  }

  // ── 9. Expenses (3 months × 10 expenses) ─────────────────────────────────
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const monthStart = firstOfMonthsAgo(2 - monthOffset)

    for (let i = 0; i < MONTHLY_EXPENSES.length; i++) {
      const tmpl = MONTHLY_EXPENSES[i]
      const expDate = addDays(monthStart, i + 1)
      const expDateStr = toDateStr(expDate)
      const amount = Math.round(tmpl.amount * 100) / 100

      await atomicTransactionWrite(
        {
          businessId,
          entryDate: expDateStr,
          reference: `EXP-${monthOffset + 1}-${i + 1}`,
          description: tmpl.description,
          sourceType: 'expense',
          createdBy: userId,
          lines: [
            { accountId: acctMap[tmpl.accountCode], debitAmount: amount, creditAmount: 0 },
            { accountId: acctMap[tmpl.payCode], debitAmount: 0, creditAmount: amount },
          ],
        },
        async (tx, journalEntryId) => {
          const [expense] = await tx
            .insert(expenses)
            .values({
              businessId,
              expenseDate: expDateStr,
              category: tmpl.accountCode,
              accountId: acctMap[tmpl.accountCode],
              amount: amount.toFixed(2),
              paymentMethod: tmpl.payCode === '1001' ? 'cash' : 'momo_mtn',
              description: tmpl.description,
              approvalStatus: 'approved',
              journalEntryId,
              createdBy: userId,
            })
            .returning({ id: expenses.id })
          return expense
        },
      )
    }
  }

  // ── 10. Staff ──────────────────────────────────────────────────────────────
  const staffIds: string[] = []
  const staffRows = await db
    .insert(staff)
    .values(
      DEMO_STAFF.map((s) => ({
        businessId,
        fullName: s.fullName,
        roleTitle: s.roleTitle,
        salaryType: 'monthly' as const,
        baseSalary: s.baseSalary.toFixed(2),
        startDate: openingDateStr,
        isActive: true,
      })),
    )
    .returning({ id: staff.id })

  for (const row of staffRows) {
    staffIds.push(row.id)
  }

  // ── 11. Payroll runs (month 2 and month 3) ────────────────────────────────
  const bands = await fetchPayeBandsForBusiness(businessId)

  if (bands.length === 0) {
    throw new Error('PAYE bands not found — Chart of Accounts seeding may have failed.')
  }

  const payrollAcctMap: Record<string, string> = {
    '6001': acctMap['6001'],
    '2200': acctMap['2200'],
    '2300': acctMap['2300'],
    '2500': acctMap['2500'],
  }

  for (let monthOffset = 1; monthOffset < 3; monthOffset++) {
    const monthStart = firstOfMonthsAgo(2 - monthOffset)
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    const periodStart = toDateStr(monthStart)
    const periodEnd = toDateStr(lastDay)

    const lineData = DEMO_STAFF.map((s, idx) => {
      const gross = s.baseSalary
      const ded = computePayrollDeductions(gross, bands)
      return {
        staffId: staffIds[idx],
        grossSalary: String(ded.grossSalary),
        ssnitEmployee: String(ded.ssnitEmployee),
        ssnitEmployer: String(ded.ssnitEmployer),
        payeTax: String(ded.payeTax),
        otherDeductions: '0',
        netSalary: String(ded.netSalary),
        totalCostToEmployer: ded.totalCostToEmployer,
      }
    })

    const totalDebit = lineData.reduce((s, l) => s + l.totalCostToEmployer, 0)
    const totalSsnit = lineData.reduce(
      (s, l) => s + Number(l.ssnitEmployee) + Number(l.ssnitEmployer),
      0,
    )
    const totalPaye = lineData.reduce((s, l) => s + Number(l.payeTax), 0)
    const totalNet = lineData.reduce((s, l) => s + Number(l.netSalary), 0)
    const totalGross = lineData.reduce((s, l) => s + Number(l.grossSalary), 0)
    const totalDeductions = lineData.reduce(
      (s, l) => s + Number(l.ssnitEmployee) + Number(l.payeTax),
      0,
    )

    await atomicTransactionWrite(
      {
        businessId,
        entryDate: periodEnd,
        reference: `PAY-${periodStart.slice(0, 7)}`,
        description: `Payroll — ${periodStart} to ${periodEnd}`,
        sourceType: 'payroll',
        createdBy: userId,
        lines: [
          {
            accountId: payrollAcctMap['6001'],
            debitAmount: Math.round(totalDebit * 100) / 100,
            creditAmount: 0,
          },
          {
            accountId: payrollAcctMap['2200'],
            debitAmount: 0,
            creditAmount: Math.round(totalSsnit * 100) / 100,
          },
          {
            accountId: payrollAcctMap['2300'],
            debitAmount: 0,
            creditAmount: Math.round(totalPaye * 100) / 100,
          },
          {
            accountId: payrollAcctMap['2500'],
            debitAmount: 0,
            creditAmount: Math.round(totalNet * 100) / 100,
          },
        ],
      },
      async (tx, journalEntryId) => {
        const [run] = await tx
          .insert(payrollRuns)
          .values({
            businessId,
            periodStart,
            periodEnd,
            status: 'approved',
            totalGross: String(Math.round(totalGross * 100) / 100),
            totalDeductions: String(Math.round(totalDeductions * 100) / 100),
            totalNet: String(Math.round(totalNet * 100) / 100),
            journalEntryId,
            createdBy: userId,
            approvedBy: userId,
          })
          .returning({ id: payrollRuns.id })

        await tx.insert(payrollLines).values(
          lineData.map((l) => ({
            payrollRunId: run.id,
            staffId: l.staffId,
            grossSalary: l.grossSalary,
            ssnitEmployee: l.ssnitEmployee,
            ssnitEmployer: l.ssnitEmployer,
            payeTax: l.payeTax,
            otherDeductions: l.otherDeductions,
            netSalary: l.netSalary,
          })),
        )

        return run
      },
    )
  }

  // ── 12. Fixed asset: generator + 2 months depreciation ───────────────────
  const assetCost = 4500
  const assetCostStr = assetCost.toFixed(2)
  const usefulLifeMonths = 60
  const monthlyDeprec = Math.round((assetCost / usefulLifeMonths) * 100) / 100 // 75.00

  let assetId: string

  await atomicTransactionWrite(
    {
      businessId,
      entryDate: openingDateStr,
      reference: 'FA-001',
      description: 'Fixed asset purchase — Generator',
      sourceType: 'manual',
      createdBy: userId,
      lines: [
        {
          accountId: acctMap['1500'],
          debitAmount: assetCost,
          creditAmount: 0,
          memo: 'Generator purchase',
        },
        { accountId: acctMap['1001'], debitAmount: 0, creditAmount: assetCost, memo: 'Cash paid' },
      ],
    },
    async (tx, journalEntryId) => {
      const [asset] = await tx
        .insert(fixedAssets)
        .values({
          businessId,
          name: 'Generator (Honda EU2200i)',
          category: 'Equipment',
          purchaseDate: openingDateStr,
          purchaseCost: assetCostStr,
          usefulLifeMonths,
          residualValue: '0',
          depreciationMethod: 'straight_line',
          accumulatedDepreciation: '0',
          assetAccountId: acctMap['1500'],
          depreciationAccountId: acctMap['6008'],
          accDepreciationAccountId: acctMap['1510'],
          isActive: true,
        })
        .returning({ id: fixedAssets.id })

      void journalEntryId
      assetId = asset.id
      return asset
    },
  )

  // 2 months of depreciation (months 2 and 3)
  let accDeprecSoFar = 0
  for (let monthOffset = 1; monthOffset < 3; monthOffset++) {
    const monthStart = firstOfMonthsAgo(2 - monthOffset)
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    const deprecDateStr = toDateStr(lastDay)

    accDeprecSoFar = Math.round((accDeprecSoFar + monthlyDeprec) * 100) / 100

    await db.transaction(async (tx) => {
      await postJournalEntry(tx, {
        businessId,
        entryDate: deprecDateStr,
        reference: `DEP-FA001-M${monthOffset}`,
        description: `Depreciation — Generator (month ${monthOffset})`,
        sourceType: 'depreciation',
        createdBy: userId,
        lines: [
          {
            accountId: acctMap['6008'],
            debitAmount: monthlyDeprec,
            creditAmount: 0,
            memo: 'Depreciation expense',
          },
          {
            accountId: acctMap['1510'],
            debitAmount: 0,
            creditAmount: monthlyDeprec,
            memo: 'Accumulated depreciation',
          },
        ],
      })

      // Update accumulated depreciation on fixed asset
      await tx
        .update(fixedAssets)
        .set({
          accumulatedDepreciation: accDeprecSoFar.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(fixedAssets.id, assetId))
    })
  }

  // ── 13. Mark onboarding complete ─────────────────────────────────────────
  await db
    .update(businesses)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(businesses.id, businessId))

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { onboardingCompleted: true },
  })

  // ── 14. Reconciliation health check ──────────────────────────────────────
  const { issuesFound, issues } = await runLedgerReconciliation(businessId)
  if (issuesFound > 0) {
    throw new Error(
      `Demo seeder produced ${issuesFound} ledger integrity issue(s): ${issues.map((i) => `${i.sourceTable}:${i.issue}`).join(', ')}. This is a bug in the seeder — please report it.`,
    )
  }
}

// Re-export for use in the server action
export { SSNIT_EMPLOYEE_RATE, SSNIT_EMPLOYER_RATE }
