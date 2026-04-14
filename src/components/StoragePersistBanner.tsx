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
    <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">⚠ Storage permission required</p>
      <p className="mt-1 text-sm text-red-700">
        BizSense needs permission to store data safely on your device. Without this, your offline
        records may be lost if your phone runs low on storage.
      </p>
      <button
        onClick={handleRetry}
        className="mt-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
      >
        Grant Storage Permission
      </button>
    </div>
  )
}
