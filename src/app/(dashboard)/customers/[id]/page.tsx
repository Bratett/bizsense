import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import {
  getCustomerById,
  getCustomerStats,
  getCustomerRecentTransactions,
} from '@/actions/customers'
import CustomerDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const session = await getServerSession()
  const { id } = await params
  const [customer, stats, transactions, biz] = await Promise.all([
    getCustomerById(id),
    getCustomerStats(id),
    getCustomerRecentTransactions(id),
    db
      .select({ name: businesses.name, phone: businesses.phone })
      .from(businesses)
      .where(eq(businesses.id, session.user.businessId))
      .then((rows) => rows[0]),
  ])
  if (!customer) notFound()
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <CustomerDetail
        customer={customer}
        stats={stats}
        transactions={transactions}
        businessName={biz?.name ?? ''}
        businessPhone={biz?.phone ?? null}
      />
    </main>
  )
}
