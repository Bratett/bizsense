import { getPayrollRunById } from '@/actions/payroll'
import PayrollRunDetail from './page.client'

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getPayrollRunById(id)
  return <PayrollRunDetail initialRun={run} />
}
