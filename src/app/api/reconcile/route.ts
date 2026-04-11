import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { runLedgerReconciliation } from '@/lib/reconciliation'

export async function POST() {
  const session = await getServerSession()
  const result = await runLedgerReconciliation(session.user.businessId)
  return NextResponse.json(result)
}
