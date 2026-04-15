'use client'

import { useEffect, useState } from 'react'
import { requestPersistentStorage } from '@/lib/offline/storagePersist'

export function StoragePersistBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handle = () => setShow(true)
    window.addEventListener('storage-persist-denied', handle)
    return () => window.removeEventListener('storage-persist-denied', handle)
  }, [])

  if (!show) return null

  const handleRetry = async () => {
    const result = await requestPersistentStorage()
    if (result.granted) setShow(false)
  }

  return (
    <div
      className="fixed bottom-24 left-4 right-4 z-30 rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-lg
                 md:bottom-4 md:left-64 md:right-auto md:max-w-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-amber-800">⚠ Storage permission needed</p>
        <button
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="shrink-0 text-amber-500 hover:text-amber-700"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs text-amber-700">
        Without this, offline records may be lost if your phone runs low on storage.
      </p>
      <button
        onClick={handleRetry}
        className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
      >
        Grant Storage Permission
      </button>
    </div>
  )
}
