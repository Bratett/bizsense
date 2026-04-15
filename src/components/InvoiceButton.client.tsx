'use client'

import { useState, useCallback } from 'react'
import { getInvoiceData } from '@/actions/invoices'
import type { InvoiceData } from '@/lib/pdf/types'
import type { InvoiceWorkerResponse } from '@/lib/pdf/invoice.worker'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { invoiceTemplate } from '@/lib/whatsapp/templates'

type InvoiceButtonProps = {
  orderId: string
  orderNumber: string
  totalAmount: string | null
  customerPhone?: string | null
  customerName?: string | null
  businessName?: string | null
  businessPhone?: string | null
}

async function generatePdfViaWorker(data: InvoiceData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(new URL('../lib/pdf/invoice.worker.ts', import.meta.url))

      worker.onmessage = (event: MessageEvent<InvoiceWorkerResponse>) => {
        worker.terminate()
        if (event.data.type === 'success') {
          resolve(event.data.blob)
        } else {
          reject(new Error(event.data.message))
        }
      }

      worker.onerror = (err) => {
        worker.terminate()
        reject(new Error(err.message || 'Worker error'))
      }

      worker.postMessage({ type: 'generate', data })
    } catch {
      // Fallback for environments that don't support workers (e.g. Turbopack dev)
      import('../lib/pdf/invoice-generator').then((mod) => {
        mod.generateInvoicePdf(data).then(resolve).catch(reject)
      })
    }
  })
}

export default function InvoiceButton({
  orderId,
  orderNumber,
  totalAmount,
  customerPhone,
  customerName,
  businessName,
  businessPhone,
}: InvoiceButtonProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generatePdf = useCallback(async (): Promise<Blob> => {
    if (pdfBlob) return pdfBlob

    setIsGenerating(true)
    setError(null)

    try {
      const data = await getInvoiceData(orderId)
      const blob = await generatePdfViaWorker(data)
      setPdfBlob(blob)
      return blob
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate invoice'
      setError(msg)
      throw err
    } finally {
      setIsGenerating(false)
    }
  }, [orderId, pdfBlob])

  const handleViewInvoice = useCallback(async () => {
    try {
      const blob = await generatePdf()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      // error already set in generatePdf
    }
  }, [generatePdf])

  const handleShareInvoice = useCallback(async () => {
    setIsSharing(true)
    setError(null)

    try {
      const blob = await generatePdf()

      // Upload to Supabase Storage
      const formData = new FormData()
      formData.append('orderId', orderId)
      formData.append('pdf', new File([blob], `${orderNumber}.pdf`, { type: 'application/pdf' }))

      const response = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Upload failed')
      }

      const { signedUrl } = await response.json()

      // Build WhatsApp deep link
      const message = invoiceTemplate({
        businessName: businessName ?? '',
        customerName: customerName ?? '',
        orderNumber,
        totalAmount: Number(totalAmount ?? 0),
        dueDate: new Date().toISOString().slice(0, 10),
        invoiceUrl: signedUrl,
        businessPhone: businessPhone ?? undefined,
      })
      const result = buildWhatsAppLink(customerPhone, message)
      if (result.ok) {
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        // No customer phone — open generic WhatsApp share
        const encoded = encodeURIComponent(message)
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to share invoice'
      setError(msg)
    } finally {
      setIsSharing(false)
    }
  }, [generatePdf, orderId, orderNumber, totalAmount, customerPhone])

  const isLoading = isGenerating || isSharing

  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <button
          onClick={handleViewInvoice}
          disabled={isLoading}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          {isGenerating && !isSharing ? 'Generating...' : 'View Invoice'}
        </button>
        <button
          onClick={handleShareInvoice}
          disabled={isLoading}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-800 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.161-2.737.813.813-2.737-.161-.252A8 8 0 1112 20z" />
          </svg>
          {isSharing ? 'Sharing...' : 'Share Invoice'}
        </button>
      </div>
      {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
    </div>
  )
}
