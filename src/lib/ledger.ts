import { eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'
import { journalEntries, journalLines } from '@/db/schema'

export type DrizzleTransaction = NodePgDatabase<typeof schema>

export type JournalLineInput = {
  accountId: string
  debitAmount: number
  creditAmount: number
  currency?: string // defaults to 'GHS'
  fxRate?: number // defaults to 1 — lock this at call time for non-GHS
  memo?: string
}

export type PostJournalEntryInput = {
  businessId: string
  entryDate: string // YYYY-MM-DD
  reference?: string
  description?: string
  sourceType: string
  sourceId?: string
  reversalOf?: string
  createdBy?: string
  aiGenerated?: boolean
  lines: JournalLineInput[]
}

export async function postJournalEntry(
  tx: DrizzleTransaction,
  input: PostJournalEntryInput,
): Promise<string> {
  if (input.lines.length < 2) {
    throw new Error('A journal entry requires at least two lines')
  }

  const totalDebits = input.lines.reduce((sum, l) => sum + l.debitAmount, 0)
  const totalCredits = input.lines.reduce((sum, l) => sum + l.creditAmount, 0)

  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new Error(
      `Journal entry does not balance: debits=${totalDebits}, credits=${totalCredits}`,
    )
  }

  const now = new Date()

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      businessId: input.businessId,
      entryDate: input.entryDate,
      reference: input.reference ?? null,
      description: input.description ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      reversalOf: input.reversalOf ?? null,
      createdBy: input.createdBy ?? null,
      aiGenerated: input.aiGenerated ?? false,
    })
    .returning({ id: journalEntries.id })

  const lineValues = input.lines.map((line) => ({
    journalEntryId: entry.id,
    accountId: line.accountId,
    debitAmount: line.debitAmount.toFixed(2),
    creditAmount: line.creditAmount.toFixed(2),
    currency: line.currency ?? 'GHS',
    fxRate: (line.fxRate ?? 1).toFixed(4),
    fxRateLockedAt: line.currency && line.currency !== 'GHS' ? now : null,
    memo: line.memo ?? null,
  }))

  await tx.insert(journalLines).values(lineValues)

  return entry.id
}

export async function reverseJournalEntry(
  tx: DrizzleTransaction,
  originalEntryId: string,
  businessId: string,
  createdBy: string,
  reason: string,
): Promise<string> {
  const [original] = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, originalEntryId))

  if (!original) {
    throw new Error(`Journal entry not found: ${originalEntryId}`)
  }

  const lines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, originalEntryId))

  const reversalInput: PostJournalEntryInput = {
    businessId,
    entryDate: new Date().toISOString().split('T')[0],
    description: `REVERSAL: ${original.description ?? ''} — ${reason}`,
    sourceType: 'reversal',
    reversalOf: originalEntryId,
    createdBy,
    aiGenerated: false,
    lines: lines.map((line) => ({
      accountId: line.accountId,
      debitAmount: Number(line.creditAmount),
      creditAmount: Number(line.debitAmount),
      currency: line.currency,
      fxRate: Number(line.fxRate),
      memo: line.memo ?? undefined,
    })),
  }

  return postJournalEntry(tx, reversalInput)
}
