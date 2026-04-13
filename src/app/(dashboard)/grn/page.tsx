import { getServerSession } from '@/lib/session'
import { listGrns } from '@/actions/grn'
import GrnList from './page.client'

export default async function GrnPage() {
  await getServerSession()
  const grns = await listGrns()
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <GrnList initialGrns={grns} />
    </main>
  )
}
