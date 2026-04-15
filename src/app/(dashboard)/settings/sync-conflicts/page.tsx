import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session'
import { getUnreviewedSyncConflicts } from '@/actions/syncConflicts'
import SyncConflictsClient from './page.client'

export default async function SyncConflictsPage() {
  const session = await getServerSession()
  const { role } = session.user

  if (role !== 'owner' && role !== 'accountant') {
    redirect('/settings')
  }

  const conflicts = await getUnreviewedSyncConflicts()

  return (
    <main className="min-h-screen bg-gray-50">
      <SyncConflictsClient conflicts={conflicts} />
    </main>
  )
}
