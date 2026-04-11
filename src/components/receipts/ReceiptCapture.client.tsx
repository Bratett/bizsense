'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import { uploadReceipt, getReceiptSignedUrl, deleteReceipt } from '@/actions/receipts'
import { resizeImage } from '@/lib/image/resize'

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// ─── Component ───────────────────────────────────────────────────────────────

type ReceiptCaptureProps = {
  expenseId: string
  existingReceiptPath?: string | null
  onUploadComplete?: (result: { path: string; signedUrl: string }) => void
  onUploadError?: (error: string) => void
}

export default function ReceiptCapture({
  expenseId,
  existingReceiptPath,
  onUploadComplete,
  onUploadError,
}: ReceiptCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(!!existingReceiptPath)
  const [error, setError] = useState<string | null>(null)
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [isLoadingUrl, setIsLoadingUrl] = useState(false)
  const [pendingBase64, setPendingBase64] = useState<string | null>(null)

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Reset input so the same file can be re-selected
      e.target.value = ''

      setError(null)

      // Validate type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Please select a photo (JPG, PNG, or WebP)')
        return
      }

      // Resize image
      let resized: { base64: string; dataUrl: string }
      try {
        resized = await resizeImage(file)
      } catch {
        setError('Failed to process image. Please try another photo.')
        return
      }

      setPreview(resized.dataUrl)
      setPendingBase64(resized.base64)
      setUploaded(false)

      // Upload
      startTransition(async () => {
        const result = await uploadReceipt({
          expenseId,
          fileBase64: resized.base64,
          mimeType: 'image/jpeg',
          fileExtension: 'jpg',
        })

        if (result.success) {
          setUploaded(true)
          setPendingBase64(null)
          onUploadComplete?.({ path: result.path, signedUrl: result.signedUrl })
        } else {
          setError(result.error)
          onUploadError?.(result.error)
        }
      })
    },
    [expenseId, onUploadComplete, onUploadError, startTransition],
  )

  const handleRetry = useCallback(() => {
    if (!pendingBase64) return
    setError(null)

    startTransition(async () => {
      const result = await uploadReceipt({
        expenseId,
        fileBase64: pendingBase64,
        mimeType: 'image/jpeg',
        fileExtension: 'jpg',
      })

      if (result.success) {
        setUploaded(true)
        setPendingBase64(null)
        onUploadComplete?.({ path: result.path, signedUrl: result.signedUrl })
      } else {
        setError(result.error)
        onUploadError?.(result.error)
      }
    })
  }, [expenseId, pendingBase64, onUploadComplete, onUploadError, startTransition])

  const handleViewReceipt = useCallback(async () => {
    setIsLoadingUrl(true)
    const result = await getReceiptSignedUrl(expenseId)
    setIsLoadingUrl(false)
    if (result.success) {
      setViewUrl(result.signedUrl)
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer')
    } else {
      setError(result.error)
    }
  }, [expenseId])

  const handleDelete = useCallback(() => {
    setError(null)
    startTransition(async () => {
      const result = await deleteReceipt(expenseId)
      if (result.success) {
        setUploaded(false)
        setPreview(null)
        setPendingBase64(null)
        setViewUrl(null)
        onUploadComplete?.({ path: '', signedUrl: '' })
      } else {
        setError(result.error)
      }
    })
  }, [expenseId, onUploadComplete, startTransition])

  // ─── Existing receipt (no new upload in progress) ──────────────────────────

  if (uploaded && !preview && existingReceiptPath) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* Green checkmark */}
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm text-gray-700">Receipt attached</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleViewReceipt}
            disabled={isLoadingUrl}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {isLoadingUrl ? 'Loading...' : 'View Receipt'}
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={isPending}
            className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Replace
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {isPending ? 'Removing...' : 'Remove'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {/* Hidden inputs for replace */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    )
  }

  // ─── Upload state (preview visible) ────────────────────────────────────────

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Receipt preview"
            className="h-[150px] w-[200px] rounded-lg border border-gray-200 object-cover"
          />
          {isPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
          {uploaded && !isPending && (
            <div className="absolute bottom-2 right-2 rounded-full bg-green-600 p-1">
              <svg
                className="h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          )}
        </div>

        {error && (
          <div className="space-y-1">
            <p className="text-xs text-red-600">{error}</p>
            {pendingBase64 && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isPending}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {uploaded && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleViewReceipt}
              disabled={isLoadingUrl}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {isLoadingUrl ? 'Loading...' : 'View Full Size'}
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              {isPending ? 'Removing...' : 'Remove'}
            </button>
          </div>
        )}

        {/* Hidden inputs for replace */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    )
  }

  // ─── No receipt — show capture buttons ─────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-300 px-3 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 active:bg-green-100 disabled:opacity-50"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
            />
          </svg>
          Take Photo
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
          Gallery
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
}
