import { getServerSession } from '@/lib/session'
import { listStaff } from '@/actions/staff'
import StaffList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function StaffPage() {
  const session = await getServerSession()
  const { businessId } = session.user
  const staffMembers = await listStaff({ isActive: true })
  return (
    <>
      <PullToRefresh>
        <StaffList businessId={businessId} initialStaff={staffMembers} />
      </PullToRefresh>
      <Fab href="/staff/new" label="Add Staff" />
    </>
  )
}
