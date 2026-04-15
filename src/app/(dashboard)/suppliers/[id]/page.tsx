import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import {
  getSupplierById,
  getSupplierStats,
  getSupplierRecentTransactions,
} from '@/actions/suppliers'
import SupplierDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const session = await getServerSession()
  const { id } = await params
  const [supplier, stats, transactions, biz] = await Promise.all([
    getSupplierById(id),
    getSupplierStats(id),
    getSupplierRecentTransactions(id),
    db
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, session.user.businessId))
      .then((rows) => rows[0]),
  ])
  if (!supplier) notFound()
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <SupplierDetail
        supplier={supplier}
        stats={stats}
        transactions={transactions}
        businessName={biz?.name ?? ''}
      />
    </main>
  )
}
