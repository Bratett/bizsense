import { getServerSession } from '@/lib/session'
import { listFixedAssets } from '@/actions/assets'
import AssetList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function AssetsPage() {
  const session = await getServerSession()
  const assets = await listFixedAssets()

  return (
    <>
      <PullToRefresh>
        <AssetList initialAssets={assets} userRole={session.user.role} />
      </PullToRefresh>
      <Fab href="/assets/new" label="Add Fixed Asset" />
    </>
  )
}
