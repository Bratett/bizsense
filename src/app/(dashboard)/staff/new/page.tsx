import { getServerSession } from '@/lib/session'
import StaffForm from './page.client'

export default async function NewStaffPage() {
  const session = await getServerSession()
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg md:max-w-2xl">
        <StaffForm businessId={session.user.businessId} mode="create" />
      </div>
    </main>
  )
}
