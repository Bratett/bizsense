import { getServerSession } from '@/lib/session'
import { AiChatClient } from './page.client'
import { db } from '@/db'
import { businesses } from '@/db/schema/core'
import { eq } from 'drizzle-orm'

export default async function AiPage() {
  const session = await getServerSession()
  const { businessId } = session.user

  const [business] = await db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId))

  return <AiChatClient businessName={business?.name ?? 'Your Business'} />
}
