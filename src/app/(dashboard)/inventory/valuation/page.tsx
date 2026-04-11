import { getServerSession } from '@/lib/session'
import { computeInventoryValuation } from '@/lib/inventory/valuation'
import { redirect } from 'next/navigation'
import ValuationReportView from './page.client'

export default async function ValuationReportPage() {
  const session = await getServerSession()
  const { role, businessId } = session.user

  if (!['owner', 'manager', 'accountant'].includes(role)) {
    redirect('/inventory')
  }

  const report = await computeInventoryValuation(businessId)

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ValuationReportView report={report} />
    </main>
  )
}
