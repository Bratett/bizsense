import { notFound } from 'next/navigation'
import { getFixedAssetById } from '@/actions/assets'
import EditAssetForm from './page.client'

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = await getFixedAssetById(id)

  if (!asset) notFound()

  return <EditAssetForm asset={asset} />
}
