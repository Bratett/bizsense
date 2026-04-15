'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'install-prompt-dismissed'

export function InstallPromptBanner() {
  const [showAndroid, setShowAndroid] = useState(false)
  const [showIOS, setShowIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Already dismissed or already installed — never show again
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const isIOS =
      /iPhone|iPad|iPod/.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream

    if (isIOS) {
      setShowIOS(true)
      return
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault() // suppress browser mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowAndroid(true)
    }

    const handleInstalled = () => {
      localStorage.setItem(DISMISSED_KEY, 'true')
      setShowAndroid(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setShowAndroid(false)
    setShowIOS(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, 'true')
    }
    setShowAndroid(false)
    setDeferredPrompt(null)
  }

  // Android Chrome install banner
  if (showAndroid) {
    return (
      <div className="fixed left-0 right-0 top-0 z-50 flex items-center gap-3 bg-blue-600 px-4 py-3 text-sm text-white">
        <span className="flex-1">Install BizSense on your home screen for offline access</span>
        <button
          onClick={handleInstall}
          className="min-h-[44px] rounded-md border border-white/60 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="min-h-[44px] min-w-[44px] rounded p-1 hover:bg-white/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // iOS Safari one-time install modal
  if (showIOS) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
        onClick={dismiss}
        aria-hidden="true"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install BizSense"
          className="mx-4 mb-8 rounded-2xl bg-white p-6 text-center shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-lg font-semibold text-gray-900">Install BizSense</p>
          <p className="mb-4 text-sm text-gray-600">
            Tap the Share button <span className="font-medium">📤</span> then tap{' '}
            <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>
          </p>
          <button
            onClick={dismiss}
            className="min-h-[44px] w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      </div>
    )
  }

  return null
}
