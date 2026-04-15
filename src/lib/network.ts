/**
 * Returns true if the device has an active network connection.
 *
 * Uses navigator.onLine as a fast first check, then attempts a lightweight
 * HEAD request to /api/ping to confirm the connection actually reaches the
 * server (navigator.onLine can be true even on captive portals).
 */
export async function isNetworkAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return false
  try {
    const res = await fetch('/api/ping', { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}
