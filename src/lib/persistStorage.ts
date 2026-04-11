export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  const granted = await navigator.storage.persist()
  if (!granted) {
    console.warn('Persistent storage not granted. IndexedDB data may be evicted by the browser.')
  }
  return granted
}
