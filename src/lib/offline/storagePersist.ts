// BROWSER ONLY

export type StoragePersistResult = {
  granted: boolean
  alreadyPersisted: boolean
  error?: string
}

/**
 * Request persistent storage from the browser.
 * Must be called on app initialisation — BEFORE any data is written to IndexedDB.
 *
 * Without this, the OS can silently evict IndexedDB when storage is low
 * (triggered by something as routine as a large WhatsApp video download).
 * On low-end Android, this can wipe a full day of unsynced transactions.
 */
export async function requestPersistentStorage(): Promise<StoragePersistResult> {
  if (!navigator.storage?.persist) {
    // Browser doesn't support the API (very old browsers)
    return { granted: false, alreadyPersisted: false, error: 'Not supported' }
  }

  const alreadyPersisted = await navigator.storage.persisted()
  if (alreadyPersisted) return { granted: true, alreadyPersisted: true }

  try {
    const granted = await navigator.storage.persist()
    return { granted, alreadyPersisted: false }
  } catch (err) {
    return {
      granted: false,
      alreadyPersisted: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Estimate storage usage and quota.
 * Used to warn users when approaching storage limits.
 */
export async function getStorageEstimate(): Promise<{
  usageBytes: number
  quotaBytes: number
  usagePercent: number
} | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return {
      usageBytes: usage,
      quotaBytes: quota,
      usagePercent: quota > 0 ? Math.round((usage / quota) * 100) : 0,
    }
  } catch {
    return null
  }
}
