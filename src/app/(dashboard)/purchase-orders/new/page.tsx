import { getServerSession } from '@/lib/session'
import { listSuppliers } from '@/actions/suppliers'
import { getLatestFxRate } from '@/actions/fx'
import NewPurchaseOrderForm from './page.client'

export default async function NewPurchaseOrderPage() {
  await getServerSession()
  const [suppliers, latestFxRate] = await Promise.all([
    listSuppliers({ isActive: true }),
    getLatestFxRate('USD').catch(() => null),
  ])

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg md:max-w-2xl">
        <NewPurchaseOrderForm
          suppliers={suppliers}
          latestUsdRate={latestFxRate ? parseFloat(latestFxRate.rate) : null}
        />
      </div>
    </main>
  )
}
