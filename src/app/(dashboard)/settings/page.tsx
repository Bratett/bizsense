import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businesses, businessSettings, taxComponents, accounts, users } from '@/db/schema'
import { getServerSession } from '@/lib/session'
import SettingsPageClient from './page.client'

export default async function SettingsPage() {
  const session = await getServerSession()
  const { businessId, role } = session.user

  const [business, allTaxComponents, allAccounts, teamMembers, existingSettings] =
    await Promise.all([
      db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .then((r) => r[0]),
      db
        .select()
        .from(taxComponents)
        .where(eq(taxComponents.businessId, businessId))
        .orderBy(taxComponents.calculationOrder),
      db.select().from(accounts).where(eq(accounts.businessId, businessId)).orderBy(accounts.code),
      db.select().from(users).where(eq(users.businessId, businessId)).orderBy(users.createdAt),
      db
        .select()
        .from(businessSettings)
        .where(eq(businessSettings.businessId, businessId))
        .then((r) => r[0] ?? null),
    ])

  if (!business) redirect('/onboarding')

  // getOrCreate: seed default settings row on first visit
  let currentSettings = existingSettings
  if (!currentSettings) {
    ;[currentSettings] = await db.insert(businessSettings).values({ businessId }).returning()
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <SettingsPageClient
        business={business}
        businessSettings={currentSettings}
        taxComponents={allTaxComponents}
        accounts={allAccounts}
        teamMembers={teamMembers}
        userRole={role}
        userId={session.user.id}
      />
    </main>
  )
}
