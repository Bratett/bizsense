'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { submitFeedback, FeedbackType } from '@/actions/feedback'

const TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'confusion', label: 'Confusion' },
]

export function FeedbackWidget() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const open = () => setIsOpen(true)
  const close = () => {
    setIsOpen(false)
    setMessage('')
    setType('bug')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await submitFeedback({ type, message, route: pathname })
      if (result.success) {
        toast.success('Thank you — feedback received!')
        close()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={open}
        aria-label="Send feedback"
        className="fixed bottom-[72px] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
          />
        </svg>
      </button>

      {/* Bottom sheet overlay */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Send Feedback"
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Send Feedback</h2>
              <button
                onClick={close}
                aria-label="Close feedback form"
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type selector */}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Type</p>
                <div className="flex gap-2">
                  {TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        type === value
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="feedback-message"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  What happened?
                </label>
                <textarea
                  id="feedback-message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what you experienced..."
                  minLength={10}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">Screen: {pathname}</p>
              </div>

              <button
                type="submit"
                disabled={isPending || message.trim().length < 10}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? 'Sending…' : 'Submit'}
              </button>
            </form>
          </div>
        </>
      )}
    </>
  )
}
