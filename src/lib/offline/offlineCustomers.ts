// BROWSER ONLY
import { localDb } from '@/db/local/dexie'
import { enqueueSync } from '@/lib/offline/offlineWrite'
import { normaliseGhanaPhone } from '@/lib/csvImport'

// ─── Input type ───────────────────────────────────────────────────────────────

export type OfflineCustomerInput = {
  businessId: string
  name: string
  phone: string
  email?: string | null
  location?: string | null
  momoNumber?: string | null
  creditLimit: number
  notes?: string | null
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Write a customer to Dexie when the network is unavailable.
 * Enqueues a sync item for server-side promotion.
 * Returns the locally-generated customerId.
 *
 * No deferred journal — customer creation has no financial posting.
 */
export async function writeCustomerOffline(input: OfflineCustomerInput): Promise<string> {
  const customerId = crypto.randomUUID()
  const now = new Date().toISOString()

  const normalisedPhone = normaliseGhanaPhone(input.phone) ?? input.phone

  const customer = {
    id: customerId,
    businessId: input.businessId,
    name: input.name.trim(),
    phone: normalisedPhone,
    email: input.email ?? null,
    location: input.location ?? null,
    momoNumber: input.momoNumber ?? null,
    creditLimit: input.creditLimit,
    paymentTermsDays: 30,
    isActive: true,
    syncStatus: 'pending' as const,
    updatedAt: now,
  }

  await localDb.transaction('rw', [localDb.customers, localDb.syncQueue], async () => {
    await localDb.customers.add(customer)
    await enqueueSync('customers', customerId, { ...customer })
  })

  return customerId
}
