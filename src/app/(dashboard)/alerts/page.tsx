import { getLowStockAlertData, getOverdueAlertData } from '@/actions/alerts'
import AlertsClient from './AlertsClient.client'

export const metadata = { title: 'Alerts | BizSense' }

export default async function AlertsPage() {
  const [lowStock, overdue] = await Promise.all([getLowStockAlertData(), getOverdueAlertData()])

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <AlertsClient lowStock={lowStock} overdue={overdue} />
    </main>
  )
}
