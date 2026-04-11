import { getServerSession } from '@/lib/session'
import { getGrnById } from '@/actions/grn'
import GrnDetail from './page.client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function GrnDetailPage({ params }: PageProps) {
  const session = await getServerSession()
  const { id } = await params
  const grn = await getGrnById(id)
  return <GrnDetail grn={grn} role={session.user.role} />
}
