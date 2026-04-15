'use client'

import { useState, useTransition } from 'react'
import { triggerDemoSeed } from './actions'

type State = 'idle' | 'seeding' | 'error'

export default function SeedDemoPage() {
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSeed = () => {
    startTransition(async () => {
      setState('seeding')
      const result = await triggerDemoSeed()
      if (!result.success) {
        setState('error')
        setErrorMsg(result.error)
      }
      // On success the server action calls redirect() — no client-side redirect needed
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1d4ed8"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 2.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
              />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-lg font-semibold text-gray-900">Seed Demo Data</h1>
        <p className="mb-6 text-sm text-gray-500">
          Populates your account with 3 months of realistic data for &ldquo;Ama Traders&rdquo; — a
          Ghanaian trading SME. This cannot be undone.
        </p>

        {state === 'error' && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700">
            <p className="font-medium">Seeding failed</p>
            <p className="mt-1">{errorMsg}</p>
          </div>
        )}

        {state === 'seeding' ? (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-600">
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v3m0 12v3M5.636 5.636l2.122 2.122m8.485 8.485l2.121 2.121M3 12h3m12 0h3M5.636 18.364l2.122-2.122M16.243 7.757l2.121-2.121"
              />
            </svg>
            Seeding data — this may take a few seconds…
          </div>
        ) : (
          <button
            onClick={handleSeed}
            disabled={isPending}
            className="min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Seed Demo Data
          </button>
        )}

        <p className="mt-4 text-xs text-gray-400">
          Only available when <code className="font-mono">DEMO_MODE=true</code>
        </p>
      </div>
    </div>
  )
}
