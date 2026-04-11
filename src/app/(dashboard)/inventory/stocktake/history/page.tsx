import { getServerSession } from '@/lib/session'
import { getStocktakeHistory } from '@/actions/stocktakes'
import StocktakeHistoryView from './page.client'

export default async function StocktakeHistoryPage() {
  await getServerSession()

  const history = await getStocktakeHistory()

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <StocktakeHistoryView history={history} />
    </main>
  )
}
