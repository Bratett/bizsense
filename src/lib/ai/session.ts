/**
 * Returns the current AI session ID for this browser tab, creating one if
 * it does not yet exist.  sessionStorage clears on tab close, so every new
 * tab starts a fresh conversation — exactly the desired stateless-per-session
 * behaviour.
 *
 * Call this only from client components (it touches sessionStorage).
 */
export function getOrCreateAiSessionId(): string {
  const key = 'ai_session_id'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const newId = crypto.randomUUID()
  sessionStorage.setItem(key, newId)
  return newId
}
