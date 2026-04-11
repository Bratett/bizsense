// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ReceiptCapture from '../ReceiptCapture.client'

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@/actions/receipts', () => ({
  uploadReceipt: vi.fn(),
  getReceiptSignedUrl: vi.fn(),
  deleteReceipt: vi.fn(),
}))

vi.mock('@/lib/image/resize', () => ({
  resizeImage: vi.fn(),
}))

import { uploadReceipt } from '@/actions/receipts'
import { resizeImage } from '@/lib/image/resize'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: resizeImage returns a small test result
  vi.mocked(resizeImage).mockResolvedValue({
    base64: 'dGVzdA==',
    dataUrl: 'data:image/jpeg;base64,dGVzdA==',
  })
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReceiptCapture', () => {
  it('shows error for non-image file', async () => {
    render(<ReceiptCapture expenseId="exp-001" />)

    const inputs = document.querySelectorAll('input[type="file"]')
    const galleryInput = inputs[1]

    const pdfFile = createFile('document.pdf', 1024, 'application/pdf')

    await act(async () => {
      fireEvent.change(galleryInput, { target: { files: [pdfFile] } })
    })

    expect(screen.getByText(/Please select a photo/i)).toBeTruthy()
    expect(uploadReceipt).not.toHaveBeenCalled()
    expect(resizeImage).not.toHaveBeenCalled()
  })

  it('shows spinner during upload', async () => {
    // uploadReceipt never resolves
    vi.mocked(uploadReceipt).mockReturnValue(new Promise(() => {}))

    render(<ReceiptCapture expenseId="exp-001" />)

    const inputs = document.querySelectorAll('input[type="file"]')
    const galleryInput = inputs[1]

    const imgFile = createFile('photo.jpg', 1024, 'image/jpeg')

    await act(async () => {
      fireEvent.change(galleryInput, { target: { files: [imgFile] } })
    })

    // Preview image should be rendered
    await waitFor(() => {
      const img = document.querySelector('img[alt="Receipt preview"]')
      expect(img).toBeTruthy()
    })

    // Spinner should be visible
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('calls onUploadComplete on success', async () => {
    vi.mocked(uploadReceipt).mockResolvedValue({
      success: true,
      path: 'receipts/biz/2026/04/exp-001.jpg',
      signedUrl: 'https://storage.test/signed',
    })

    const onComplete = vi.fn()
    render(<ReceiptCapture expenseId="exp-001" onUploadComplete={onComplete} />)

    const inputs = document.querySelectorAll('input[type="file"]')
    const galleryInput = inputs[1]

    const imgFile = createFile('photo.jpg', 1024, 'image/jpeg')

    await act(async () => {
      fireEvent.change(galleryInput, { target: { files: [imgFile] } })
    })

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        path: 'receipts/biz/2026/04/exp-001.jpg',
        signedUrl: 'https://storage.test/signed',
      })
    })
  })

  it('shows error message and retry button on upload failure', async () => {
    vi.mocked(uploadReceipt).mockResolvedValue({
      success: false,
      error: 'Upload failed: network error',
    })

    render(<ReceiptCapture expenseId="exp-001" />)

    const inputs = document.querySelectorAll('input[type="file"]')
    const galleryInput = inputs[1]

    const imgFile = createFile('photo.jpg', 1024, 'image/jpeg')

    await act(async () => {
      fireEvent.change(galleryInput, { target: { files: [imgFile] } })
    })

    await waitFor(() => {
      expect(screen.getByText(/Upload failed/i)).toBeTruthy()
    })

    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('renders View Receipt link for existing receipt', () => {
    render(
      <ReceiptCapture expenseId="exp-001" existingReceiptPath="receipts/biz/2026/04/exp-001.jpg" />,
    )

    expect(screen.getByText('View Receipt')).toBeTruthy()
    expect(screen.getByText('Receipt attached')).toBeTruthy()
  })
})
