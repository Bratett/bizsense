// BROWSER ONLY

/**
 * Returns true if the device has a functional network connection.
 * navigator.onLine is unreliable (returns true for captive portals).
 * A lightweight ping to /api/health provides a more reliable check.
 */
export async function isNetworkAvailable(): Promise<boolean> {
  if (!navigator.onLine) return false

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}
