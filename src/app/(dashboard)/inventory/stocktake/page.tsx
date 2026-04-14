import { getServerSession } from '@/lib/session'
import { getActiveStocktake } from '@/actions/stocktakes'
import StocktakeView from './page.client'

export default async function StocktakePage() {
  const session = await getServerSession()
  const { role } = session.user

  const activeStocktake = await getActiveStocktake()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <StocktakeView activeStocktake={activeStocktake} userRole={role} />
    </main>
  )
}
