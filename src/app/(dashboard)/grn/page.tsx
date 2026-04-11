import { getServerSession } from '@/lib/session'
import { listGrns } from '@/actions/grn'
import GrnList from './page.client'

export default async function GrnPage() {
  await getServerSession()
  const grns = await listGrns()
  return <GrnList initialGrns={grns} />
}
