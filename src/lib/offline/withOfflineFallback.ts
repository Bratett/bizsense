// BROWSER ONLY

/**
 * Attempt a Server Action. If the network is unavailable, run the offline fallback.
 *
 * Critical distinction:
 * - Network failure (TypeError) → fallback to offline path
 * - Server-side validation error ({ success: false }) → return as-is, do NOT fall back
 *
 * The wasOffline flag signals to the caller that an offline write occurred,
 * so it can show a "Saved offline" banner and skip the Dexie mirror call.
 */
export async function withOfflineFallback<T>(
  serverAction: () => Promise<T>,
  offlineFallback: () => Promise<T>,
  options?: { requiresConnectivity?: boolean },
): Promise<T & { wasOffline?: boolean }> {
  // Operations that cannot work offline — throw immediately
  if (options?.requiresConnectivity && !navigator.onLine) {
    throw new Error('This operation requires a network connection. Please reconnect and try again.')
  }

  // Fast path: already known to be offline — skip the network attempt entirely
  if (!navigator.onLine) {
    const result = await offlineFallback()
    return { ...result, wasOffline: true }
  }

  try {
    const result = await serverAction()
    return result as T & { wasOffline?: boolean }
  } catch (err) {
    // Only fall back on network-level failures (TypeError = fetch failed)
    // Re-throw application errors (auth failures, unexpected exceptions, etc.)
    if (err instanceof TypeError) {
      const result = await offlineFallback()
      return { ...result, wasOffline: true }
    }
    throw err
  }
}
