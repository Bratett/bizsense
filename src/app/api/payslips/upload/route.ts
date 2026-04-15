import { NextResponse, type NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { payrollRuns } from '@/db/schema/payroll'
import { getServerSession } from '@/lib/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  const { businessId } = session.user

  const formData = await request.formData()
  const payrollRunId = formData.get('payrollRunId') as string
  const staffId = formData.get('staffId') as string
  const pdf = formData.get('pdf') as File

  if (!payrollRunId || !staffId || !pdf) {
    return NextResponse.json(
      { error: 'payrollRunId, staffId and pdf are required' },
      { status: 400 },
    )
  }

  // Verify the payroll run belongs to this business
  const [run] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.businessId, businessId)))

  if (!run) {
    return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
  }

  // Upload to Supabase Storage
  const supabase = await createSupabaseServerClient()
  const path = `payslips/${businessId}/${payrollRunId}/${staffId}.pdf`
  const buffer = Buffer.from(await pdf.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from('documents').upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Generate signed URL (1-hour expiry for payslip sharing)
  const { data: signedData, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 60 * 60)

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: `Failed to create signed URL: ${signError?.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ signedUrl: signedData.signedUrl })
}
