import { getSalesSummary, listSales } from '@/actions/sales'
import SalesList from './SalesList.client'

export default async function SalesPage() {
  const [summary, salesData] = await Promise.all([
    getSalesSummary(),
    listSales({ page: 1, pageSize: 20 }),
  ])

  return <SalesList initialSales={salesData} summary={summary} />
}
