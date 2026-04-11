import { getReceivablesAging } from '@/actions/sales'
import ReceivablesAging from './ReceivablesAging.client'

export default async function ReceivablesAgingPage() {
  const data = await getReceivablesAging()
  return <ReceivablesAging initialData={data} />
}
