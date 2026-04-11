import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import BackfillView from './page.client'

export default async function BackfillPage() {
  const session = await getServerSession()
  const { role } = session.user

  if (role !== 'owner' && role !== 'accountant') {
    redirect('/inventory')
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <BackfillView />
      </div>
    </main>
  )
}
