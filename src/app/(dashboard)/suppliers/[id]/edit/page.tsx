import { getSupplierById } from '@/actions/suppliers'
import EditSupplierForm from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditSupplierPage({ params }: PageProps) {
  const { id } = await params
  const supplier = await getSupplierById(id)
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <EditSupplierForm supplier={supplier} />
      </div>
    </main>
  )
}
