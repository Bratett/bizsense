'use server'

import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  businesses,
  accounts,
  products,
  inventoryTransactions,
  customers,
  orders,
  orderLines,
  suppliers,
  journalEntries,
  journalLines,
} from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { postJournalEntry } from '@/lib/ledger'
import { seedChartOfAccounts, type SeededAccounts } from '@/lib/seeds/seedChartOfAccounts'
import { seedTaxComponents } from '@/lib/seeds/seedTaxComponents'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

type ActionResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

type Step2Input = {
  openingBalanceDate: string
  balances: Array<{
    accountCode: string
    amount: number
    label?: string
  }>
}

type ProductInput = {
  name: string
  sku?: string
  category?: string
  unit?: string
  qtyOnHand: number
  costPrice: number
}

type Step3Input = {
  products: ProductInput[]
}

type InvoiceInput = {
  customerName: string
  phone?: string
  amount: number
  invoiceDate: string
  dueDate?: string
}

type Step4Input = {
  invoices: InvoiceInput[]
}

type PayableInput = {
  supplierName: string
  phone?: string
  amountOwed: number
  dueDate?: string
}

type Step5Input = {
  payables: PayableInput[]
}

export type OpeningPositionSummary = {
  cashTotal: number
  inventoryTotal: number
  receivablesTotal: number
  payablesTotal: number
  totalAssets: number
  totalLiabilities: number
  netEquity: number
  balanced: boolean
  difference: number
  openingBalanceDate: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getBusinessWithAccounts(businessId: string) {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId))

  if (!business) throw new Error('Business not found')
  if (!business.seededAccountIds) {
    throw new Error('Chart of Accounts has not been seeded. Complete Step 1 first.')
  }

  const accountIds = business.seededAccountIds as SeededAccounts
  return { business, accountIds }
}

// ─── Step 1: Business Profile ────────────────────────────────────────────────

export async function completeOnboardingStep1(formData: FormData): Promise<ActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const industry = (formData.get('industry') as string | null)?.trim() ?? ''
  const address = (formData.get('address') as string | null)?.trim() ?? ''
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const tin = (formData.get('tin') as string | null)?.trim() ?? ''
  const vatRegistered = formData.get('vatRegistered') === 'true'
  const vatNumber = (formData.get('vatNumber') as string | null)?.trim() ?? ''
  const vatEffectiveDate = (formData.get('vatEffectiveDate') as string | null)?.trim() ?? ''
  const financialYearStart = (formData.get('financialYearStart') as string | null)?.trim() ?? '1'
  const logo = formData.get('logo') as File | null

  // Validation
  const fieldErrors: Record<string, string> = {}
  if (!phone) fieldErrors.phone = 'Business phone is required'
  if (vatRegistered && !vatNumber)
    fieldErrors.vatNumber = 'VAT number is required for VAT-registered businesses'

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: 'Please fix the errors below', fieldErrors }
  }

  // Seed accounts + update business profile in one transaction
  let seededAccounts: SeededAccounts
  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        industry: industry || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        tin: tin || null,
        vatRegistered,
        vatNumber: vatRegistered ? vatNumber : null,
        financialYearStart: financialYearStart || '1',
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId))

    seededAccounts = await seedChartOfAccounts(tx, businessId)

    if (vatRegistered) {
      const effectiveDate = vatEffectiveDate ? new Date(vatEffectiveDate) : new Date()
      await seedTaxComponents(tx, businessId, seededAccounts['2100'], effectiveDate)
    }

    await tx
      .update(businesses)
      .set({ seededAccountIds: seededAccounts })
      .where(eq(businesses.id, businessId))
  })

  // Logo upload (outside transaction -- Supabase Storage is separate)
  if (logo && logo.size > 0) {
    const ext = logo.name.split('.').pop()?.toLowerCase() ?? 'png'
    if (!['png', 'jpg', 'jpeg'].includes(ext)) {
      return { success: false, error: 'Logo must be PNG or JPG' }
    }
    if (logo.size > 2 * 1024 * 1024) {
      return { success: false, error: 'Logo must be under 2MB' }
    }

    const buffer = Buffer.from(await logo.arrayBuffer())
    const path = `${businessId}/logo.${ext}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('logos')
      .upload(path, buffer, { contentType: logo.type, upsert: true })

    if (!uploadError) {
      const { data: urlData } = supabaseAdmin.storage.from('logos').getPublicUrl(path)

      await db
        .update(businesses)
        .set({ logoUrl: urlData.publicUrl, updatedAt: new Date() })
        .where(eq(businesses.id, businessId))
    }
  }

  return { success: true }
}

// ─── Step 2: Opening Cash & Bank Balances ────────────────────────────────────

export async function completeOnboardingStep2(input: Step2Input): Promise<ActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user
  const { accountIds } = await getBusinessWithAccounts(businessId)

  if (!input.openingBalanceDate) {
    return { success: false, error: 'Opening balance date is required' }
  }

  const nonZeroBalances = input.balances.filter((b) => b.amount > 0)
  const equityAccountId = accountIds['3001']
  if (!equityAccountId) throw new Error("Owner's Equity account (3001) not found")

  await db.transaction(async (tx) => {
    // Create additional bank accounts if they have codes beyond the default set
    for (const bal of nonZeroBalances) {
      if (!accountIds[bal.accountCode] && bal.label) {
        const [inserted] = await tx
          .insert(accounts)
          .values({
            businessId,
            code: bal.accountCode,
            name: bal.label,
            type: 'asset',
            subtype: 'current_asset',
            cashFlowActivity: 'operating',
            isSystem: false,
            currency: 'GHS',
          })
          .returning({ id: accounts.id })
        accountIds[bal.accountCode] = inserted.id

        // Update seededAccountIds on the business
        await tx
          .update(businesses)
          .set({ seededAccountIds: { ...accountIds } })
          .where(eq(businesses.id, businessId))
      }
    }

    // Post ONE journal entry per non-zero cash account
    const accountCodeToName: Record<string, string> = {
      '1001': 'Cash on Hand',
      '1002': 'MTN MoMo',
      '1003': 'Telecel Cash',
      '1004': 'AirtelTigo Money',
      '1005': 'Bank Account',
    }

    for (const bal of nonZeroBalances) {
      const cashAccountId = accountIds[bal.accountCode]
      if (!cashAccountId) {
        throw new Error(`Account ${bal.accountCode} not found in seeded accounts`)
      }

      const accountName =
        bal.label || accountCodeToName[bal.accountCode] || `Account ${bal.accountCode}`
      const amount = Math.round(bal.amount * 100) / 100

      await postJournalEntry(tx, {
        businessId,
        entryDate: input.openingBalanceDate,
        reference: 'OB-CASH',
        description: `Opening balance \u2014 ${accountName}`,
        sourceType: 'opening_balance',
        createdBy: session.user.id,
        lines: [
          { accountId: cashAccountId, debitAmount: amount, creditAmount: 0 },
          { accountId: equityAccountId, debitAmount: 0, creditAmount: amount },
        ],
      })
    }

    // Save the opening balance date
    await tx
      .update(businesses)
      .set({ openingBalanceDate: input.openingBalanceDate, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
  })

  return { success: true }
}

// ─── Step 3: Inventory Opening Stock ─────────────────────────────────────────

export async function completeOnboardingStep3(input: Step3Input): Promise<ActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user
  const { business, accountIds } = await getBusinessWithAccounts(businessId)

  const validProducts = input.products.filter(
    (p) => p.name.trim() && p.qtyOnHand > 0 && p.costPrice >= 0,
  )
  if (validProducts.length === 0) return { success: true }

  const openingDate = business.openingBalanceDate
  if (!openingDate) {
    return {
      success: false,
      error: 'Please complete Step 2 first to set your opening balance date',
    }
  }

  const inventoryAccountId = accountIds['1200']
  const equityAccountId = accountIds['3001']
  if (!inventoryAccountId || !equityAccountId) {
    throw new Error('Required accounts (1200, 3001) not found')
  }

  await db.transaction(async (tx) => {
    let totalInventoryValue = 0

    for (let i = 0; i < validProducts.length; i++) {
      const p = validProducts[i]
      const sku = p.sku?.trim() || `P${String(i + 1).padStart(3, '0')}`
      const costStr = p.costPrice.toFixed(2)
      const qty = p.qtyOnHand

      const [product] = await tx
        .insert(products)
        .values({
          businessId,
          name: p.name.trim(),
          sku,
          category: p.category?.trim() || null,
          unit: p.unit || null,
          costPrice: costStr,
          sellingPrice: costStr,
          trackInventory: true,
        })
        .returning({ id: products.id })

      await tx.insert(inventoryTransactions).values({
        businessId,
        productId: product.id,
        transactionType: 'opening',
        quantity: qty.toFixed(2),
        unitCost: costStr,
        transactionDate: openingDate,
        notes: 'Opening stock',
      })

      totalInventoryValue += Math.round(qty * p.costPrice * 100) / 100
    }

    if (totalInventoryValue > 0) {
      const amount = Math.round(totalInventoryValue * 100) / 100

      await postJournalEntry(tx, {
        businessId,
        entryDate: openingDate,
        reference: 'OB-INVENTORY',
        description: `Opening stock \u2014 ${validProducts.length} products`,
        sourceType: 'opening_balance',
        createdBy: session.user.id,
        lines: [
          { accountId: inventoryAccountId, debitAmount: amount, creditAmount: 0 },
          { accountId: equityAccountId, debitAmount: 0, creditAmount: amount },
        ],
      })
    }
  })

  return { success: true }
}

// ─── Step 4: Outstanding Customer Invoices ───────────────────────────────────

export async function completeOnboardingStep4(input: Step4Input): Promise<ActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user
  const { business, accountIds } = await getBusinessWithAccounts(businessId)

  const validInvoices = input.invoices.filter((inv) => inv.customerName.trim() && inv.amount > 0)
  if (validInvoices.length === 0) return { success: true }

  const openingDate = business.openingBalanceDate
  if (!openingDate) {
    return {
      success: false,
      error: 'Please complete Step 2 first to set your opening balance date',
    }
  }

  const arAccountId = accountIds['1100']
  const revenueAccountId = accountIds['4001']
  if (!arAccountId || !revenueAccountId) {
    throw new Error('Required accounts (1100, 4001) not found')
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < validInvoices.length; i++) {
      const inv = validInvoices[i]
      const amount = Math.round(inv.amount * 100) / 100

      // Upsert customer by phone number
      let customerId: string
      if (inv.phone?.trim()) {
        const [existing] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.businessId, businessId), eq(customers.phone, inv.phone.trim())))
        if (existing) {
          customerId = existing.id
        } else {
          const [created] = await tx
            .insert(customers)
            .values({
              businessId,
              name: inv.customerName.trim(),
              phone: inv.phone.trim(),
            })
            .returning({ id: customers.id })
          customerId = created.id
        }
      } else {
        const [created] = await tx
          .insert(customers)
          .values({
            businessId,
            name: inv.customerName.trim(),
          })
          .returning({ id: customers.id })
        customerId = created.id
      }

      // Post journal entry per invoice
      const journalEntryId = await postJournalEntry(tx, {
        businessId,
        entryDate: inv.invoiceDate || openingDate,
        reference: `OB-AR-${i + 1}`,
        description: `Opening receivable \u2014 ${inv.customerName.trim()}`,
        sourceType: 'opening_balance',
        createdBy: session.user.id,
        lines: [
          { accountId: arAccountId, debitAmount: amount, creditAmount: 0 },
          { accountId: revenueAccountId, debitAmount: 0, creditAmount: amount },
        ],
      })

      // Create order record
      const orderNumber = `OB-${String(i + 1).padStart(4, '0')}`
      const [order] = await tx
        .insert(orders)
        .values({
          businessId,
          orderNumber,
          customerId,
          orderDate: inv.invoiceDate || openingDate,
          status: 'fulfilled',
          paymentStatus: 'unpaid',
          totalAmount: amount.toFixed(2),
          subtotal: amount.toFixed(2),
          amountPaid: '0',
          journalEntryId,
          createdBy: session.user.id,
        })
        .returning({ id: orders.id })

      // Single order line
      await tx.insert(orderLines).values({
        orderId: order.id,
        description: `Opening balance invoice \u2014 ${inv.customerName.trim()}`,
        quantity: '1',
        unitPrice: amount.toFixed(2),
        lineTotal: amount.toFixed(2),
      })
    }
  })

  return { success: true }
}

// ─── Step 5: Outstanding Supplier Balances ───────────────────────────────────

export async function completeOnboardingStep5(input: Step5Input): Promise<ActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user
  const { business, accountIds } = await getBusinessWithAccounts(businessId)

  const validPayables = input.payables.filter((p) => p.supplierName.trim() && p.amountOwed > 0)
  if (validPayables.length === 0) return { success: true }

  const openingDate = business.openingBalanceDate
  if (!openingDate) {
    return {
      success: false,
      error: 'Please complete Step 2 first to set your opening balance date',
    }
  }

  const obAdjustmentId = accountIds['2101']
  const apAccountId = accountIds['2001']
  if (!obAdjustmentId || !apAccountId) {
    throw new Error('Required accounts (2101, 2001) not found')
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < validPayables.length; i++) {
      const p = validPayables[i]
      const amount = Math.round(p.amountOwed * 100) / 100

      // Upsert supplier by phone number
      if (p.phone?.trim()) {
        const [existing] = await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(eq(suppliers.businessId, businessId), eq(suppliers.phone, p.phone.trim())))
        if (!existing) {
          await tx.insert(suppliers).values({
            businessId,
            name: p.supplierName.trim(),
            phone: p.phone.trim(),
          })
        }
      } else {
        await tx.insert(suppliers).values({
          businessId,
          name: p.supplierName.trim(),
        })
      }

      // Post journal entry per payable
      await postJournalEntry(tx, {
        businessId,
        entryDate: openingDate,
        reference: `OB-AP-${i + 1}`,
        description: `Opening payable \u2014 ${p.supplierName.trim()}`,
        sourceType: 'opening_balance',
        createdBy: session.user.id,
        lines: [
          { accountId: obAdjustmentId, debitAmount: amount, creditAmount: 0 },
          { accountId: apAccountId, debitAmount: 0, creditAmount: amount },
        ],
      })
    }
  })

  return { success: true }
}

// ─── CSV Import: Products ───────────────────────────────────────────────────

type ImportResult = { success: true; imported: number } | { success: false; error: string }

type ProductCsvInput = {
  name: string
  sku?: string
  category?: string
  unit?: string
  costPrice: number
  sellingPrice?: number
  reorderLevel?: number
}

export async function importProductsCsv(input: {
  products: ProductCsvInput[]
}): Promise<ImportResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const validProducts = input.products.filter((p) => p.name.trim())
  if (validProducts.length === 0) {
    return { success: false, error: 'No valid products to import' }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < validProducts.length; i++) {
      const p = validProducts[i]
      const sku = p.sku?.trim() || `P${String(i + 1).padStart(3, '0')}`
      const costStr = p.costPrice.toFixed(2)
      const sellingStr = p.sellingPrice !== undefined ? p.sellingPrice.toFixed(2) : costStr

      await tx.insert(products).values({
        businessId,
        name: p.name.trim(),
        sku,
        category: p.category?.trim() || null,
        unit: p.unit || null,
        costPrice: costStr,
        sellingPrice: sellingStr,
        trackInventory: true,
        reorderLevel: p.reorderLevel ?? 0,
      })
    }
  })

  return { success: true, imported: validProducts.length }
}

// ─── CSV Import: Customers ─────────────────────────────────────────────────

type CustomerCsvInput = {
  name: string
  phone: string
  location?: string
  creditLimit?: number
}

export async function importCustomersCsv(input: {
  customers: CustomerCsvInput[]
}): Promise<ImportResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  const validCustomers = input.customers.filter((c) => c.name.trim() && c.phone.trim())
  if (validCustomers.length === 0) {
    return { success: false, error: 'No valid customers to import' }
  }

  // Check for phone conflicts with existing customers
  const phones = validCustomers.map((c) => c.phone.trim())
  const existing = await db
    .select({ phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), inArray(customers.phone, phones)))

  if (existing.length > 0) {
    const conflicting = existing.map((e) => e.phone).join(', ')
    return {
      success: false,
      error: `Phone numbers already exist: ${conflicting}`,
    }
  }

  await db.transaction(async (tx) => {
    for (const c of validCustomers) {
      await tx.insert(customers).values({
        businessId,
        name: c.name.trim(),
        phone: c.phone.trim(),
        location: c.location?.trim() || null,
        creditLimit: c.creditLimit !== undefined ? c.creditLimit.toFixed(2) : '0',
      })
    }
  })

  return { success: true, imported: validCustomers.length }
}

// ─── CSV Import: Invoices ──────────────────────────────────────────────────

type InvoiceCsvInput = {
  customerName: string
  customerPhone?: string
  invoiceAmount: number
  invoiceDate: string // YYYY-MM-DD
  dueDate?: string // YYYY-MM-DD
}

export async function importInvoicesCsv(input: {
  invoices: InvoiceCsvInput[]
}): Promise<ImportResult> {
  const session = await getServerSession()
  const { businessId } = session.user
  const { business, accountIds } = await getBusinessWithAccounts(businessId)

  const validInvoices = input.invoices.filter(
    (inv) => inv.customerName.trim() && inv.invoiceAmount > 0,
  )
  if (validInvoices.length === 0) {
    return { success: false, error: 'No valid invoices to import' }
  }

  const openingDate = business.openingBalanceDate
  if (!openingDate) {
    return {
      success: false,
      error: 'Please complete Step 2 first to set your opening balance date',
    }
  }

  const arAccountId = accountIds['1100']
  const revenueAccountId = accountIds['4001']
  if (!arAccountId || !revenueAccountId) {
    throw new Error('Required accounts (1100, 4001) not found')
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < validInvoices.length; i++) {
      const inv = validInvoices[i]
      const amount = Math.round(inv.invoiceAmount * 100) / 100

      // Upsert customer by phone number (same pattern as completeOnboardingStep4)
      let customerId: string
      if (inv.customerPhone?.trim()) {
        const [existing] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.businessId, businessId),
              eq(customers.phone, inv.customerPhone.trim()),
            ),
          )
        if (existing) {
          customerId = existing.id
        } else {
          const [created] = await tx
            .insert(customers)
            .values({
              businessId,
              name: inv.customerName.trim(),
              phone: inv.customerPhone.trim(),
            })
            .returning({ id: customers.id })
          customerId = created.id
        }
      } else {
        const [created] = await tx
          .insert(customers)
          .values({
            businessId,
            name: inv.customerName.trim(),
          })
          .returning({ id: customers.id })
        customerId = created.id
      }

      // Post journal entry per invoice
      const journalEntryId = await postJournalEntry(tx, {
        businessId,
        entryDate: inv.invoiceDate || openingDate,
        reference: `OB-AR-CSV-${i + 1}`,
        description: `Opening receivable (CSV) \u2014 ${inv.customerName.trim()}`,
        sourceType: 'opening_balance',
        createdBy: session.user.id,
        lines: [
          { accountId: arAccountId, debitAmount: amount, creditAmount: 0 },
          { accountId: revenueAccountId, debitAmount: 0, creditAmount: amount },
        ],
      })

      // Create order record
      const orderNumber = `OB-CSV-${String(i + 1).padStart(4, '0')}`
      const [order] = await tx
        .insert(orders)
        .values({
          businessId,
          orderNumber,
          customerId,
          orderDate: inv.invoiceDate || openingDate,
          status: 'fulfilled',
          paymentStatus: 'unpaid',
          totalAmount: amount.toFixed(2),
          subtotal: amount.toFixed(2),
          amountPaid: '0',
          journalEntryId,
          createdBy: session.user.id,
        })
        .returning({ id: orders.id })

      // Single order line
      await tx.insert(orderLines).values({
        orderId: order.id,
        description: `Opening balance invoice (CSV) \u2014 ${inv.customerName.trim()}`,
        quantity: '1',
        unitPrice: amount.toFixed(2),
        lineTotal: amount.toFixed(2),
      })
    }
  })

  return { success: true, imported: validInvoices.length }
}

// ─── Step 6: Review — Opening Position Summary ──────────────────────────────

export async function getOpeningPositionSummary(): Promise<OpeningPositionSummary> {
  const session = await getServerSession()
  const { businessId } = session.user

  const [business] = await db
    .select({ openingBalanceDate: businesses.openingBalanceDate })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  // Get all opening balance journal line data
  const rows = await db
    .select({
      accountCode: accounts.code,
      accountType: accounts.type,
      debitAmount: journalLines.debitAmount,
      creditAmount: journalLines.creditAmount,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(
      and(
        eq(journalEntries.businessId, businessId),
        eq(journalEntries.sourceType, 'opening_balance'),
      ),
    )

  let cashTotal = 0
  let inventoryTotal = 0
  let receivablesTotal = 0
  let payablesTotal = 0
  let totalDebits = 0
  let totalCredits = 0

  for (const row of rows) {
    const debit = Number(row.debitAmount)
    const credit = Number(row.creditAmount)
    totalDebits += debit
    totalCredits += credit

    const code = row.accountCode

    // Cash accounts: 1001-1008
    if (code >= '1001' && code <= '1008') {
      cashTotal += debit - credit
    }
    // Inventory: 1200
    else if (code === '1200') {
      inventoryTotal += debit - credit
    }
    // Accounts Receivable: 1100
    else if (code === '1100') {
      receivablesTotal += debit - credit
    }
    // Accounts Payable: 2001
    else if (code === '2001') {
      payablesTotal += credit - debit
    }
  }

  const totalAssets = cashTotal + inventoryTotal + receivablesTotal
  const totalLiabilities = payablesTotal
  const netEquity = totalAssets - totalLiabilities

  const difference = Math.round((totalDebits - totalCredits) * 100) / 100
  const balanced = Math.abs(difference) < 0.01

  return {
    cashTotal: Math.round(cashTotal * 100) / 100,
    inventoryTotal: Math.round(inventoryTotal * 100) / 100,
    receivablesTotal: Math.round(receivablesTotal * 100) / 100,
    payablesTotal: Math.round(payablesTotal * 100) / 100,
    totalAssets: Math.round(totalAssets * 100) / 100,
    totalLiabilities: Math.round(totalLiabilities * 100) / 100,
    netEquity: Math.round(netEquity * 100) / 100,
    balanced,
    difference,
    openingBalanceDate: business?.openingBalanceDate ?? null,
  }
}

// ─── Dev Helper (used by Ledger dev toolbar) ────────────────────────────────

export async function seedBusiness(): Promise<{ accounts: number; taxComponents: number }> {
  const session = await getServerSession()
  const { businessId } = session.user

  let accountCount = 0
  let taxCount = 0

  await db.transaction(async (tx) => {
    const seeded = await seedChartOfAccounts(tx, businessId)
    accountCount = Object.keys(seeded).length

    const vatAccountId = seeded['2100']
    if (vatAccountId) {
      await seedTaxComponents(tx, businessId, vatAccountId, new Date('2023-01-01'))
      taxCount = 4
    }
  })

  return { accounts: accountCount, taxComponents: taxCount }
}

// ─── Complete Onboarding ─────────────────────────────────────────────────────

export async function completeOnboarding(): Promise<ActionResult> {
  const session = await getServerSession()
  const { businessId } = session.user

  await db
    .update(businesses)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(businesses.id, businessId))

  // Update Supabase user metadata so middleware knows onboarding is done
  const { error } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
    user_metadata: {
      onboardingCompleted: true,
    },
  })

  if (error) {
    return { success: false, error: 'Failed to finalize onboarding. Please try again.' }
  }

  return { success: true }
}
