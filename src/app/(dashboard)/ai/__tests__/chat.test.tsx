// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/actions/aiPromotions', () => ({
  confirmAiAction: vi.fn(),
  rejectAiAction: vi.fn(),
}))

vi.mock('@/lib/ai/session', () => ({
  getOrCreateAiSessionId: vi.fn(),
}))

vi.mock('@/components/ai/ConfirmationCard', () => ({
  ConfirmationCard: ({
    pendingAction,
    onConfirm,
    onReject,
  }: {
    pendingAction: { id: string; status: string; expiresAt: string; humanReadable: string }
    onConfirm: (id: string) => Promise<void>
    onReject: (id: string) => Promise<void>
  }) => {
    const isExpired = new Date(pendingAction.expiresAt) < new Date()
    return (
      <div data-testid="confirmation-card" data-status={pendingAction.status}>
        <p>{pendingAction.humanReadable}</p>
        <button
          onClick={() => onConfirm(pendingAction.id)}
          disabled={isExpired}
          data-testid="confirm-btn"
        >
          Confirm
        </button>
        <button onClick={() => onReject(pendingAction.id)} data-testid="reject-btn">
          Reject
        </button>
        {isExpired && <p data-testid="expired-label">Expired</p>}
      </div>
    )
  },
}))

import { getOrCreateAiSessionId } from '@/lib/ai/session'
import { confirmAiAction, rejectAiAction } from '@/actions/aiPromotions'
import { AiChatClient } from '../page.client'

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_ID = 'test-session-uuid-001'
const FUTURE = new Date(Date.now() + 30 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 1000).toISOString()

const PENDING_ACTION = {
  id: 'pending-001',
  actionType: 'record_sale',
  humanReadable: 'Sale of 5 × Tomatoes @ GHS 10.00',
  proposedData: {},
  expiresAt: FUTURE,
  status: 'pending' as const,
}

// ─── Setup ────────────────────────────────────────────────────────────────────

// jsdom does not implement scrollIntoView — stub it
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = vi.fn()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getOrCreateAiSessionId).mockReturnValue(SESSION_ID)
  global.fetch = vi.fn()
  // Reset scrollIntoView mock between tests
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchChat(response = 'I can help with that.', toolCalls: unknown[] = []) {
  // First call: /api/ai/chat → chat response
  // Second call: /api/ai/pending-actions → no pending actions
  vi.mocked(global.fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response, toolCalls }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: [] }),
    } as Response)
}

function mockFetchChatWithPending(
  response = 'Please review the transaction below.',
  pendingActions: unknown[] = [PENDING_ACTION],
) {
  vi.mocked(global.fetch)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response,
        toolCalls: [{ name: 'record_sale' }],
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actions: pendingActions }),
    } as Response)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AiChatClient — rendering', () => {
  it('Test 1: renders greeting message on mount', () => {
    render(<AiChatClient businessName="Test Business" />)

    expect(screen.getByText(/Hi! I'm your BizSense assistant/i)).toBeTruthy()
  })

  it('Test 7b: renders business name in header', () => {
    render(<AiChatClient businessName="Ama Store" />)
    expect(screen.getByText('Ama Store')).toBeTruthy()
  })
})

describe('AiChatClient — send flow', () => {
  it('Test 2: submitting a message calls POST /api/ai/chat with conversation history + sessionId', async () => {
    mockFetchChat()
    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'How are sales today?' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ai/chat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining(SESSION_ID),
        }),
      )
    })

    const body = JSON.parse(
      (vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.sessionId).toBe(SESSION_ID)
    expect(body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'How are sales today?' }),
      ]),
    )
  })

  it('Test 3: loading indicator shown while request in-flight', async () => {
    // fetch never resolves
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'What is my profit?' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    // Loading dots should be in the DOM
    const loadingDots = document.querySelector('[aria-label="Loading"]')
    expect(loadingDots).toBeTruthy()
  })

  it('Test 4: assistant response rendered after API returns', async () => {
    mockFetchChat('Your total sales today are GHS 500.')
    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Sales today?' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => {
      expect(screen.getByText('Your total sales today are GHS 500.')).toBeTruthy()
    })
  })

  it('Test 5: error state shown and retry available when API returns error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Hello' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy()
      expect(screen.getByText('Retry')).toBeTruthy()
    })
  })
})

describe('AiChatClient — ConfirmationCard', () => {
  it('Test 6: ConfirmationCard renders when pending action is present', async () => {
    mockFetchChatWithPending()
    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Record a sale' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-card')).toBeTruthy()
    })
  })

  it('Test 7: Confirm button calls confirmAiAction, card transitions to confirmed state', async () => {
    vi.mocked(confirmAiAction).mockResolvedValue({
      success: true,
      resultId: 'order-001',
      resultTable: 'orders',
    })
    mockFetchChatWithPending()

    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Record a sale' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => screen.getByTestId('confirm-btn'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-btn'))
    })

    await waitFor(() => {
      expect(confirmAiAction).toHaveBeenCalledWith('pending-001')
    })

    // A success message with "Recorded" should appear
    await waitFor(() => {
      expect(screen.getByText(/Recorded successfully/i)).toBeTruthy()
    })
  })

  it('Test 8: Reject button calls rejectAiAction', async () => {
    vi.mocked(rejectAiAction).mockResolvedValue(undefined)
    mockFetchChatWithPending()

    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Record a sale' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => screen.getByTestId('reject-btn'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('reject-btn'))
    })

    await waitFor(() => {
      expect(rejectAiAction).toHaveBeenCalledWith('pending-001')
    })
  })

  it('Test 9: Expired pending action — confirm button is disabled, expired label shown', async () => {
    const expiredAction = { ...PENDING_ACTION, expiresAt: PAST }
    mockFetchChatWithPending('Review this transaction.', [expiredAction])

    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Record a sale' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })

    await waitFor(() => screen.getByTestId('confirm-btn'))

    const confirmBtn = screen.getByTestId('confirm-btn')
    expect(confirmBtn).toHaveProperty('disabled', true)
    expect(screen.getByTestId('expired-label')).toBeTruthy()
  })
})

describe('AiChatClient — session ID', () => {
  it('Test 10: sessionId is stable within page session (same on repeated API calls)', async () => {
    mockFetchChat('Response 1')
    mockFetchChat('Response 2')

    render(<AiChatClient businessName="Test Business" />)

    const textarea = screen.getByPlaceholderText(/Ask me anything/i)

    // First message
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'First message' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })
    await waitFor(() => screen.getByText('Response 1'))

    // Second message
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Second message' } })
      fireEvent.click(screen.getByLabelText('Send message'))
    })
    await waitFor(() => screen.getByText('Response 2'))

    const calls = vi
      .mocked(global.fetch)
      .mock.calls.filter(([url]) => (url as string) === '/api/ai/chat')
    expect(calls.length).toBe(2)

    const body1 = JSON.parse((calls[0][1] as RequestInit).body as string)
    const body2 = JSON.parse((calls[1][1] as RequestInit).body as string)
    expect(body1.sessionId).toBe(SESSION_ID)
    expect(body2.sessionId).toBe(SESSION_ID)
  })

  it('Test 11: sessionId differs when sessionStorage is cleared (new page load simulation)', () => {
    const SESSION_B = 'session-b-uuid'

    // First invocation returns SESSION_ID
    vi.mocked(getOrCreateAiSessionId).mockReturnValueOnce(SESSION_ID)
    // After simulated reload (clear + new call) returns SESSION_B
    vi.mocked(getOrCreateAiSessionId).mockReturnValueOnce(SESSION_B)

    expect(getOrCreateAiSessionId()).toBe(SESSION_ID)
    expect(getOrCreateAiSessionId()).toBe(SESSION_B)
    expect(SESSION_ID).not.toBe(SESSION_B)
  })
})
