'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

/**
 * Listens for the 'recurring-expenses-posted' custom event dispatched by
 * AppInitialiser and shows a non-intrusive toast notification.
 */
export function RecurringExpensesToast() {
  const router = useRouter()

  useEffect(() => {
    function handleEvent(e: Event) {
      const { posted } = (e as CustomEvent<{ posted: number }>).detail
      toast.success(
        `Auto-posted ${posted} recurring expense${posted === 1 ? '' : 's'}. Tap to review.`,
        {
          duration: 6000,
          action: {
            label: 'View',
            onClick: () => router.push('/expenses'),
          },
        },
      )
    }

    window.addEventListener('recurring-expenses-posted', handleEvent)
    return () => window.removeEventListener('recurring-expenses-posted', handleEvent)
  }, [router])

  return null
}
