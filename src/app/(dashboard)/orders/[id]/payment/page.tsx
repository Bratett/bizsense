import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { getOrderById } from '@/actions/orders'
import PaymentFormClient from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RecordPaymentPage({ params }: PageProps) {
  await getServerSession()
  const { id } = await params
  const order = await getOrderById(id)

  // Guard: only show for unpaid/partial fulfilled orders
  if (order.status !== 'fulfilled' || order.paymentStatus === 'paid') {
    redirect(`/orders/${id}`)
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <PaymentFormClient order={order} />
      </div>
    </main>
  )
}
