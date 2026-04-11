import { requireRole } from '@/lib/auth/requireRole'
import { computePayablesAging } from '@/lib/suppliers/payablesAging'
import PayablesAgingClient from './page.client'

export const dynamic = 'force-dynamic'

export default async function PayablesAgingPage() {
  const user = await requireRole(['owner', 'manager', 'accountant'])
  const report = await computePayablesAging(user.businessId)

  return <PayablesAgingClient report={report} />
}
