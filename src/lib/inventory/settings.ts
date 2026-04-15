// SERVER ONLY — called from Server Actions. Do not import in client components.
// Reads configurable inventory behaviour from the business_settings table.
// Sprint 12: replaces the hardcoded constants that were used in Sprints 1–11.

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { businessSettings } from '@/db/schema'

export async function getAllowNegativeStock(businessId: string): Promise<boolean> {
  const [settings] = await db
    .select({ allowNegativeStock: businessSettings.allowNegativeStock })
    .from(businessSettings)
    .where(eq(businessSettings.businessId, businessId))
  return settings?.allowNegativeStock ?? false
}

export async function getLowStockThreshold(businessId: string): Promise<number> {
  const [settings] = await db
    .select({ lowStockThreshold: businessSettings.lowStockThreshold })
    .from(businessSettings)
    .where(eq(businessSettings.businessId, businessId))
  return settings?.lowStockThreshold ?? 5
}
