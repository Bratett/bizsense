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
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <GrnDetail grn={grn} role={session.user.role} />
    </main>
  )
}
