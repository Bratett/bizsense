'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
      <Card className="relative w-full max-w-md rounded-2xl shadow-xl">
        <CardContent className="p-6">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </Button>

          <h2 className="text-lg font-semibold text-gray-900">
            You&apos;re set up! Make your first entry.
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Your books are balanced and ready. What would you like to do first?
          </p>

          <div className="grid grid-cols-1 gap-3 mt-5">
            <Card
              size="sm"
              className="cursor-pointer bg-muted/50 transition-colors hover:bg-muted"
              onClick={() => router.push('/orders/new')}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-lg">
                  &#x1F9FE;
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Record a Sale</p>
                  <p className="text-xs text-gray-500">A customer just bought something</p>
                </div>
              </CardContent>
            </Card>

            <Card
              size="sm"
              className="cursor-pointer bg-muted/50 transition-colors hover:bg-muted"
              onClick={() => router.push('/ai')}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600 text-lg">
                  &#x1F4AC;
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Ask BizSense AI</p>
                  <p className="text-xs text-gray-500">
                    Tell me what happened and I&apos;ll record it
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 text-center">
            <Link href="/ledger" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View my opening position &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
