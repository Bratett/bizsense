'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const DISMISS_KEY = 'bizsense:firstTimeOverlayDismissed'

export default function FirstTimeOverlay() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) !== 'true') {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          &times;
        </button>

        <h2 className="text-lg font-semibold text-gray-900">
          You&apos;re set up! Make your first entry.
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Your books are balanced and ready. What would you like to do first?
        </p>

        <div className="grid grid-cols-1 gap-3 mt-5">
          <button
            onClick={() => router.push('/orders/new')}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:bg-gray-100 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-lg">
              &#x1F9FE;
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Record a Sale</p>
              <p className="text-xs text-gray-500">A customer just bought something</p>
            </div>
          </button>

          <button
            onClick={() => router.push('/ai')}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left hover:bg-gray-100 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600 text-lg">
              &#x1F4AC;
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Ask BizSense AI</p>
              <p className="text-xs text-gray-500">Tell me what happened and I&apos;ll record it</p>
            </div>
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link href="/ledger" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View my opening position &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
