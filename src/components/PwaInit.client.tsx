'use client'

import { useEffect, useState } from 'react'

/**
 * PwaInit — mounts once at the app root and requests persistent IndexedDB storage.
 *
 * Without persistent storage, Android browsers can silently evict IndexedDB when
 * the OS reclaims space (e.g. after a large WhatsApp download). For an offline-first
 * app where unsynced transactions may live exclusively in IndexedDB, this is
 * catastrophic data loss with no recovery path.
 *
 * navigator.storage.persist() prompts the user (or grants silently in some browsers
 * when the PWA is installed). If the user declines, we surface a persistent warning
 * banner rather than failing silently.
 *
 * Spec ref: section 3.1 — "This call must be implemented in Sprint 1, not deferred."
 */
export default function PwaInit() {
  const [storageDeclined, setStorageDeclined] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!navigator.storage?.persist) return

    navigator.storage.persist().then((granted) => {
      if (!granted) setStorageDeclined(true)
    })
  }, [])

  if (!storageDeclined || dismissed) return null

  return (
    <div
      role="alert"
      className="fixed bottom-0 left-0 right-0 z-50 bg-amber-50 border-t-2 border-amber-300 shadow-lg"
    >
      <div className="max-w-2xl mx-auto flex items-start justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Persistent storage not granted</p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Your browser may delete offline data when device storage runs low — including unsynced
            sales and expenses. To protect your records, install BizSense as an app on your home
            screen, or allow storage permission when your browser asks.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss storage warning"
          className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 underline mt-0.5"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
