'use client'

import { useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'
import { resizeImage } from '@/lib/image/resize'
import { uploadProductImage, removeProductImage } from '@/actions/inventory'

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_BYTES = 3 * 1024 * 1024 // 3 MB client-side guard
const PRODUCT_IMAGE_MAX_PX = 800

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductImageUploadRef = {
  /**
   * Call on form submit. Uploads pending file if one was selected.
   * Pass overrideProductId when the productId wasn't known at mount time (new-product flow).
   * Returns the new imageUrl, or null if no pending file or upload failed.
   */
  flush: (overrideProductId?: string) => Promise<string | null>
}

type Props = {
  productId: string
  currentImageUrl: string | null
  onChange?: (url: string | null) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProductImageUpload = forwardRef<ProductImageUploadRef, Props>(function ProductImageUpload(
  { productId, currentImageUrl, onChange },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<{
    base64: string
    mimeType: string
    extension: string
  } | null>(null)
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(currentImageUrl)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Expose flush() to parent form's submit handler
  useImperativeHandle(ref, () => ({
    async flush(overrideProductId?: string): Promise<string | null> {
      if (!pendingFile) return displayedUrl // nothing new selected

      const targetId = overrideProductId ?? productId
      setIsUploading(true)
      setError(null)
      try {
        const { imageUrl } = await uploadProductImage({
          productId: targetId,
          fileBase64: pendingFile.base64,
          mimeType: pendingFile.mimeType,
          extension: pendingFile.extension,
        })
        setPendingFile(null)
        setDisplayedUrl(imageUrl)
        onChange?.(imageUrl)
        return imageUrl
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        setError(msg)
        return null
      } finally {
        setIsUploading(false)
      }
    },
  }))

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Please select a photo (JPG, PNG, or WebP)')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Image must be under 3 MB')
      return
    }

    try {
      const resized = await resizeImage(file, PRODUCT_IMAGE_MAX_PX)
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      setPreview(resized.dataUrl)
      setPendingFile({ base64: resized.base64, mimeType: 'image/jpeg', extension: ext })
    } catch {
      setError('Failed to process image. Please try another photo.')
    }
  }, [])

  const handleRemove = useCallback(async () => {
    setError(null)
    setPreview(null)
    setPendingFile(null)

    if (displayedUrl) {
      try {
        await removeProductImage(productId)
      } catch {
        // best-effort; DB already cleared on server
      }
      setDisplayedUrl(null)
      onChange?.(null)
    }
  }, [displayedUrl, productId, onChange])

  const shownImage = preview ?? displayedUrl

  return (
    <div className="space-y-2">
      {shownImage ? (
        // ── Image set — thumbnail + actions ──────────────────────────────────
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shownImage}
            alt="Product image"
            className="h-[100px] w-[100px] rounded-lg border border-gray-200 object-cover"
          />
          <div className="flex flex-col gap-2">
            {pendingFile && (
              <span className="text-xs text-amber-600">Pending — will upload on save</span>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              {isUploading ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      ) : (
        // ── No image — dashed upload zone ─────────────────────────────────────
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex h-[100px] w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
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
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
            />
          </svg>
          Tap to add a product photo
        </button>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  )
})

export default ProductImageUpload
