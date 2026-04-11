const STORAGE_KEY = 'bizsense_device_prefix'
// Exclude visually ambiguous characters: I, O, 0, 1
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generatePrefix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join('')
}

export function getDevicePrefix(): string {
  if (typeof window === 'undefined') {
    throw new Error('getDevicePrefix can only be called in the browser')
  }

  let prefix = localStorage.getItem(STORAGE_KEY)
  if (!prefix) {
    prefix = generatePrefix()
    localStorage.setItem(STORAGE_KEY, prefix)
  }
  return prefix
}
