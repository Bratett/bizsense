'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ConfirmationCard, type PendingActionProps } from '@/components/ai/ConfirmationCard'
import { confirmAiAction, rejectAiAction } from '@/actions/aiPromotions'
import { getOrCreateAiSessionId } from '@/lib/ai/session'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingActions?: PendingActionProps[]
  isLoading?: boolean
  isError?: boolean
}

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  content:
    "Hi! I'm your BizSense assistant. You can tell me about sales, expenses, " +
    'ask about your finances, or check stock levels. What can I help with?',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse markdown-style [label](url) links in text and return an array of
 * plain text / anchor elements.
 */
function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\[([^\]]+)\]\((\/[^)]+)\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const [, label, href] = match
    parts.push(
      <Link key={match.index} href={href} className="underline text-blue-700">
        {label}
      </Link>,
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

// ─── Loading dots ─────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Loading">
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onConfirmAction,
  onRejectAction,
}: {
  message: Message
  onConfirmAction: (pendingId: string) => Promise<void>
  onRejectAction: (pendingId: string) => Promise<void>
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? '' : 'flex gap-2'}`}>
        {/* Avatar for assistant */}
        {!isUser && (
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold mt-1">
            AI
          </div>
        )}

        <div className={isUser ? '' : 'flex-1'}>
          <div
            className={
              isUser
                ? 'rounded-2xl rounded-tr-sm bg-green-700 px-4 py-3 text-sm text-white'
                : 'rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 text-sm text-gray-800'
            }
          >
            {message.isLoading ? (
              <LoadingDots />
            ) : message.isError ? (
              <span className="text-red-600">{message.content}</span>
            ) : (
              renderWithLinks(message.content)
            )}
          </div>

          {/* Confirmation cards below the assistant bubble */}
          {!isUser && message.pendingActions && message.pendingActions.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.pendingActions.map((action) => (
                <ConfirmationCard
                  key={action.id}
                  pendingAction={action}
                  onConfirm={onConfirmAction}
                  onReject={onRejectAction}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AiChatClient ─────────────────────────────────────────────────────────────

export function AiChatClient({ businessName }: { businessName: string }) {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialise session ID once on mount (client only — sessionStorage)
  useEffect(() => {
    sessionIdRef.current = getOrCreateAiSessionId()
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send ────────────────────────────────────────────────────────────────────

  async function sendMessage(userText: string) {
    if (!userText.trim() || isSubmitting) return

    const sessionId = sessionIdRef.current ?? getOrCreateAiSessionId()
    setLastError(null)
    setIsSubmitting(true)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userText,
    }
    const loadingId = crypto.randomUUID()
    const loadingMsg: Message = {
      id: loadingId,
      role: 'assistant',
      content: '',
      isLoading: true,
    }

    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setInput('')

    // Build conversation history for the API (exclude the loading placeholder)
    const history = [...messages, userMsg]
      .filter((m) => !m.isLoading && !m.isError)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, sessionId }),
      })

      if (!res.ok) {
        throw new Error(`API error ${res.status}`)
      }

      const data = (await res.json()) as { response: string; toolCalls?: { name: string }[] }

      // Fetch any new pending actions for this session
      let pendingActions: PendingActionProps[] = []
      try {
        const pendingRes = await fetch(`/api/ai/pending-actions?sessionId=${sessionId}`)
        if (pendingRes.ok) {
          const pendingData = (await pendingRes.json()) as { actions: PendingActionProps[] }
          pendingActions = pendingData.actions ?? []
        }
      } catch {
        // Non-fatal — just show no cards
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? {
                ...m,
                content: data.response,
                isLoading: false,
                pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
              }
            : m,
        ),
      )
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setLastError(errorText)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? {
                ...m,
                content: 'Something went wrong. Please try again.',
                isLoading: false,
                isError: true,
              }
            : m,
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Retry ───────────────────────────────────────────────────────────────────

  function handleRetry() {
    // Find the last user message and re-send it
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    // Remove the error message
    setMessages((prev) => prev.filter((m) => !m.isError))
    sendMessage(lastUser.content)
  }

  // ── Key handler ─────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ── ConfirmationCard callbacks ──────────────────────────────────────────────

  async function handleConfirmAction(pendingId: string) {
    const result = await confirmAiAction(pendingId)
    if (!result.success) throw new Error(result.error)

    // Append a success system message
    if (result.resultId && result.resultTable) {
      const routeMap: Record<string, string> = {
        orders: '/orders',
        expenses: '/expenses',
        customers: '/customers',
        suppliers: '/suppliers',
      }
      const route = routeMap[result.resultTable]
      const link = route ? ` [View record](${route}/${result.resultId})` : ''
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Recorded successfully.${link}`,
        },
      ])
    }
  }

  async function handleRejectAction(pendingId: string) {
    await rejectAiAction(pendingId)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const charCount = input.length
  const showCharCounter = charCount > 400

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">AI Assistant</h1>
          <p className="text-xs text-gray-500">{businessName}</p>
        </div>
        <Link href="/ai/activity" className="text-sm text-green-700 hover:underline">
          Activity Log
        </Link>
      </header>

      {/* Message area */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onConfirmAction={handleConfirmAction}
            onRejectAction={handleRejectAction}
          />
        ))}

        {/* Retry banner */}
        {lastError && !isSubmitting && (
          <div className="mx-auto mt-2 flex max-w-sm items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="flex-1 text-sm text-red-700">Something went wrong.</p>
            <button
              onClick={handleRetry}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                // Auto-resize up to 3 rows
                e.target.style.height = 'auto'
                const lineHeight = 24
                const maxHeight = lineHeight * 3 + 16
                e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your business..."
              disabled={isSubmitting}
              rows={1}
              className="w-full resize-none rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
              style={{ minHeight: '48px', maxHeight: '88px', overflowY: 'auto' }}
            />
            {showCharCounter && (
              <span
                className={`absolute bottom-2 right-2 text-xs ${charCount > 1000 ? 'text-red-500' : 'text-gray-400'}`}
              >
                {charCount}
              </span>
            )}
          </div>

          {/* Mic placeholder */}
          <button
            type="button"
            title="Voice input coming soon."
            disabled
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
            aria-label="Voice input (coming soon)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isSubmitting}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-700 text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </footer>
    </div>
  )
}
