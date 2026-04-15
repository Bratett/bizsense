import { notFound } from 'next/navigation'
import { getStaffById } from '@/actions/staff'
import StaffDetailView from './page.client'

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const member = await getStaffById(id)
    return <StaffDetailView member={member} />
  } catch {
    notFound()
  }
}
