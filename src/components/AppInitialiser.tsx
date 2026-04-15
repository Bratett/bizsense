'use client'

import { useEffect } from 'react'
import { requestPersistentStorage } from '@/lib/offline/storagePersist'
import { bootstrapLocalData } from '@/lib/offline/bootstrap'
import { startSyncProcessor } from '@/lib/offline/syncProcessor'
import { startRealtimeSubscription } from '@/lib/offline/realtime'
import { processRecurringExpenses } from '@/actions/expenses'

interface AppInitialiserProps {
  businessId: string // from server-side session — passed as prop
}

export function AppInitialiser({ businessId }: AppInitialiserProps) {
  useEffect(() => {
    let syncInterval: ReturnType<typeof setInterval>

    async function init() {
      // ── Step 1: Request persistent storage ─────────────────────────────
      const persist = await requestPersistentStorage()

      if (!persist.granted && !persist.alreadyPersisted) {
        // Show a non-dismissible banner (rendered via a global store)
        // "BizSense needs permission to store data safely on your device.
        //  Without this, your offline records may be lost."
        // The banner has one action: "Grant Storage Permission" (re-triggers persist)
        window.dispatchEvent(new CustomEvent('storage-persist-denied'))
      }

      // ── Step 2: Bootstrap data from Supabase if needed ──────────────────
      // bootstrapLocalData checks if the DB is empty or stale and fetches
      await bootstrapLocalData(businessId)

      // ── Step 2b: Process any due recurring expenses (online only) ────────
      if (navigator.onLine) {
        try {
          const { posted } = await processRecurringExpenses()
          if (posted > 0) {
            window.dispatchEvent(
              new CustomEvent('recurring-expenses-posted', { detail: { posted } }),
            )
          }
        } catch {
          // Non-blocking — failure here must never prevent app boot
        }
      }

      // ── Step 2c: Pre-warm PDF worker to eliminate cold-start delay ───────
      // Dynamic import triggers Next.js to fetch the worker chunk in the
      // background — first invoice/payslip print will find it already loaded.
      void import('@/lib/pdf/invoice.worker')

      // ── Step 3: Start background sync processor ─────────────────────────
      // Runs immediately once, then every 30 seconds
      await startSyncProcessor(businessId)
      syncInterval = setInterval(() => startSyncProcessor(businessId), 30_000)

      // ── Step 4: Supabase Realtime for multi-device push ─────────────────
      startRealtimeSubscription(businessId)
    }

    init().catch(console.error)

    // ── Online/offline event listeners ───────────────────────────────────
    const handleOnline = () => {
      startSyncProcessor(businessId) // drain queue immediately on reconnect
      window.dispatchEvent(new CustomEvent('connectivity-change', { detail: { online: true } }))
    }
    const handleOffline = () => {
      window.dispatchEvent(new CustomEvent('connectivity-change', { detail: { online: false } }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(syncInterval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [businessId])

  return null // renders nothing — side effects only
}
