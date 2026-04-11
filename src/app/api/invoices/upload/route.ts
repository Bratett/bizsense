import { NextResponse, type NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { orders } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  const { businessId } = session.user

  const formData = await request.formData()
  const orderId = formData.get('orderId') as string
  const pdf = formData.get('pdf') as File

  if (!orderId || !pdf) {
    return NextResponse.json(
      { error: 'orderId and pdf are required' },
      { status: 400 },
    )
  }

  // Verify the order belongs to this business
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.businessId, businessId)))

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Upload to Supabase Storage
  const supabase = await createSupabaseServerClient()
  const path = `invoices/${businessId}/${orderId}.pdf`
  const buffer = Buffer.from(await pdf.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    )
  }

  // Generate signed URL with 7-day expiry
  const { data: signedData, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 7 * 24 * 60 * 60)

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: `Failed to create signed URL: ${signError?.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ signedUrl: signedData.signedUrl })
}
