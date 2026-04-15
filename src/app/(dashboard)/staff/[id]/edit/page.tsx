import { notFound } from 'next/navigation'
import { getStaffById } from '@/actions/staff'
import StaffForm from '../../new/page.client'

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const member = await getStaffById(id)
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="mx-auto max-w-lg md:max-w-2xl">
          <StaffForm businessId={member.businessId} mode="edit" initialData={member} />
        </div>
      </main>
    )
  } catch {
    notFound()
  }
}
