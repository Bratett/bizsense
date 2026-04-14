'use client'

import { useEffect, useState } from 'react'

export function ConnectivityBadge() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handle = (e: Event) => {
      setIsOnline((e as CustomEvent).detail.online)
    }
    window.addEventListener('connectivity-change', handle)
    return () => window.removeEventListener('connectivity-change', handle)
  }, [])

  if (isOnline) return null // no badge when online — silent success

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 bg-amber-500 py-1 text-center
                    text-sm font-medium text-white"
    >
      📵 Offline — transactions are saved locally and will sync when reconnected
    </div>
  )
}
