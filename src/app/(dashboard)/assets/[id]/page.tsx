import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { getFixedAssetById, getDepreciationSchedule } from '@/actions/assets'
import AssetDetailView from './page.client'

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession()
  const [asset, schedule] = await Promise.all([getFixedAssetById(id), getDepreciationSchedule(id)])

  if (!asset) notFound()

  return <AssetDetailView asset={asset} schedule={schedule} userRole={session.user.role} />
}
