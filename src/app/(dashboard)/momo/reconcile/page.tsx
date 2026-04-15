import { getMoMoReconciliationData } from '@/actions/momoReconciliation'
import { MoMoReconcileClient } from './page.client'

export const metadata = {
  title: 'MoMo Reconciliation — BizSense',
}

export default async function MoMoReconcilePage() {
  const accounts = await getMoMoReconciliationData()

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">MoMo Account Reconciliation</h1>
      <p className="mb-6 text-sm text-gray-500">
        Check your wallet balances and compare to your books.
      </p>
      <MoMoReconcileClient accounts={accounts} />
    </main>
  )
}
