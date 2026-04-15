import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { getSsnitRemittanceReport } from '@/lib/reports/ssnitRemittance'
import { getPayeRemittanceReport } from '@/lib/reports/payeRemittance'
import RemittancePage from './page.client'

export default async function PayrollRemittanceServerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: runId } = await params

  const session = await getServerSession()
  const { businessId, role } = session.user

  if (role === 'cashier') redirect('/access-denied')

  const [ssnitReport, payeReport, bizRows] = await Promise.all([
    getSsnitRemittanceReport(businessId, runId),
    getPayeRemittanceReport(businessId, runId),
    db
      .select({ name: businesses.name, ssnitNumber: businesses.ssnitNumber })
      .from(businesses)
      .where(eq(businesses.id, businessId)),
  ])

  const businessName = bizRows[0]?.name ?? ''
  const businessSsnitNumber = bizRows[0]?.ssnitNumber ?? null

  return (
    <RemittancePage
      ssnitReport={ssnitReport}
      payeReport={payeReport}
      businessName={businessName}
      businessSsnitNumber={businessSsnitNumber}
    />
  )
}
