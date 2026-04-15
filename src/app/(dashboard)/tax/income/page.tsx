import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { getIncomeTaxEstimate } from '@/lib/reports/incomeTax'
import IncomeTaxPage from './page.client'

export const metadata = { title: 'Income Tax Estimate | BizSense' }

export default async function IncomeTaxServerPage() {
  const session = await getServerSession()
  const { businessId, role } = session.user

  if (role === 'cashier') redirect('/access-denied')

  const today = new Date().toISOString().slice(0, 10)
  const estimate = await getIncomeTaxEstimate(businessId, today)

  return <IncomeTaxPage estimate={estimate} asOfDate={today} />
}
