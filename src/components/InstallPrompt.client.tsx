'use client'

import { useEffect, useState } from 'react'

// Chrome/Edge fire this event when all PWA installability criteria are met.
// We must call preventDefault() to suppress the browser's own mini-infobar
// and store the event so we can trigger the native dialog ourselves.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'

interface InstallPromptProps {
  // sidebar  → full-width text row styled to match the sidebar nav items
  // drawer   → icon+label tile styled to match the BottomNav More drawer grid
  variant: 'sidebar' | 'drawer'
  // Called after the native install dialog is triggered (e.g. to close the drawer)
  onInstall?: () => void
}

export function InstallPrompt({ variant, onInstall }: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Respect a previous explicit dismissal
    if (localStorage.getItem(DISMISSED_KEY) === 'true') {
      setDismissed(true)
      return
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault() // suppress browser mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      // App was installed (via address bar or our button) — hide permanently
      setDeferredPrompt(null)
      localStorage.setItem(DISMISSED_KEY, 'true')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  // Nothing to show: no prompt available, already installed, or dismissed
  if (!deferredPrompt || dismissed) return null

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    onInstall?.()
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      localStorage.setItem(DISMISSED_KEY, 'true')
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    setDeferredPrompt(null)
    localStorage.setItem(DISMISSED_KEY, 'true')
  }

  if (variant === 'sidebar') {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleInstallClick}
          className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          {/* Download-to-device icon */}
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            className="shrink-0 text-green-700"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Install App
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="rounded p-1.5 text-gray-400 hover:text-gray-600"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // drawer variant — matches the MORE_ITEMS grid tile style
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button
        onClick={handleInstallClick}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-gray-600 transition-colors hover:bg-gray-50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
          <svg
            width="18"
            height="18"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Install App</p>
          <p className="text-xs text-gray-500">Add BizSense to your home screen</p>
        </div>
      </button>
    </div>
  )
}
