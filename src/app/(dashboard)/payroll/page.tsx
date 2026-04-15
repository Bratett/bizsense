import { getPayrollRuns } from '@/actions/payroll'
import PayrollList from './page.client'
import Fab from '@/components/Fab.client'
import PullToRefresh from '@/components/PullToRefresh.client'

export default async function PayrollPage() {
  const runs = await getPayrollRuns()
  return (
    <>
      <PullToRefresh>
        <PayrollList initialRuns={runs} />
      </PullToRefresh>
      <Fab href="/payroll/new" label="Start Payroll Run" />
    </>
  )
}
