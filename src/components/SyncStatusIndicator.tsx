'use client'

import { useEffect, useState } from 'react'
import { localDb } from '@/db/local/dexie'

export function SyncStatusIndicator() {
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = await localDb.syncQueue.where('status').equals('pending').count()
      const failed = await localDb.syncQueue.where('status').equals('failed').count()
      setPendingCount(pending)
      setFailedCount(failed)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  if (failedCount > 0)
    return (
      <span className="text-red-600 text-xs">
        ⚠ {failedCount} sync error{failedCount > 1 ? 's' : ''} — tap to review
      </span>
    )
  if (pendingCount > 0)
    return (
      <span className="text-amber-600 text-xs">
        ⟳ Syncing {pendingCount} record{pendingCount > 1 ? 's' : ''}...
      </span>
    )
  return null
}
