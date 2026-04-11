import { getSupplierById } from '@/actions/suppliers'
import SupplierDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const { id } = await params
  const supplier = await getSupplierById(id)
  return <SupplierDetail supplier={supplier} />
}
