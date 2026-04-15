import { getServerSession } from '@/lib/session'
import { listFixedAssets } from '@/actions/assets'
import DepreciationRunPage from './page.client'

export default async function DepreciationPage() {
  const session = await getServerSession()
  const assets = await listFixedAssets()

  return (
    <DepreciationRunPage
      initialAssets={assets}
      userRole={session.user.role}
    />
  )
}
