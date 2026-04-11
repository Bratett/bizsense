import { listSuppliers } from '@/actions/suppliers'
import SupplierList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function SuppliersPage() {
  const suppliers = await listSuppliers({ isActive: true })
  return (
    <>
      <PullToRefresh>
        <SupplierList initialSuppliers={suppliers} />
      </PullToRefresh>
      <Fab href="/suppliers/new" label="New Supplier" />
    </>
  )
}
