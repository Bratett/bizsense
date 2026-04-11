'use client'

import { useState, useEffect } from 'react'

type SyncStatus = 'synced' | 'syncing' | 'offline'

export default function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('synced')

  useEffect(() => {
    const updateStatus = () => {
      setStatus(navigator.onLine ? 'synced' : 'offline')
    }
    updateStatus()

    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
    }
  }, [])

  const dotColor =
    status === 'synced'
      ? 'bg-green-500'
      : status === 'syncing'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-gray-400'

  const label = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing...' : 'Offline'

  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}
