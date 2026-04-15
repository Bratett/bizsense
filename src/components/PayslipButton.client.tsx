'use client'

import { useState, useCallback } from 'react'
import { getPayslipData } from '@/actions/payroll'
import type { PayslipData } from '@/actions/payroll'
import type { PayslipWorkerResponse } from '@/lib/pdf/payslip.worker'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { payslipTemplate } from '@/lib/whatsapp/templates'

type PayslipButtonProps = {
  payrollLineId: string
  staffName: string
  staffPhone?: string | null
  payrollRunId: string
  staffId: string
  businessName?: string | null
  businessPhone?: string | null
  period: string // "April 2026"
  netSalary: string
}

async function generatePdfViaWorker(data: PayslipData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(new URL('../lib/pdf/payslip.worker.ts', import.meta.url))

      worker.onmessage = (event: MessageEvent<PayslipWorkerResponse>) => {
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
      import('../lib/pdf/payslip-generator').then((mod) => {
        mod.generatePayslipPdf(data).then(resolve).catch(reject)
      })
    }
  })
}

export default function PayslipButton({
  payrollLineId,
  staffName,
  staffPhone,
  payrollRunId,
  staffId,
  businessName,
  businessPhone,
  period,
  netSalary,
}: PayslipButtonProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generatePdf = useCallback(async (): Promise<Blob> => {
    if (pdfBlob) return pdfBlob

    setIsGenerating(true)
    setError(null)

    try {
      const data = await getPayslipData(payrollLineId)
      const blob = await generatePdfViaWorker(data)
      setPdfBlob(blob)
      return blob
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate payslip'
      setError(msg)
      throw err
    } finally {
      setIsGenerating(false)
    }
  }, [payrollLineId, pdfBlob])

  const handleView = useCallback(async () => {
    try {
      const blob = await generatePdf()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch {
      // error already set in generatePdf
    }
  }, [generatePdf])

  const handleShare = useCallback(async () => {
    setIsSharing(true)
    setError(null)

    try {
      const blob = await generatePdf()

      const formData = new FormData()
      formData.append('payrollRunId', payrollRunId)
      formData.append('staffId', staffId)
      formData.append(
        'pdf',
        new File([blob], `payslip-${staffName.toLowerCase().replace(/\s+/g, '-')}-${period}.pdf`, {
          type: 'application/pdf',
        }),
      )

      const response = await fetch('/api/payslips/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Upload failed')
      }

      const { signedUrl } = await response.json()

      const message = payslipTemplate({
        businessName: businessName ?? '',
        staffName,
        period,
        netSalary: Number(netSalary),
        payslipUrl: signedUrl,
      })

      const result = buildWhatsAppLink(staffPhone, message)
      if (result.ok) {
        window.open(result.url, '_blank', 'noopener,noreferrer')
      } else {
        const encoded = encodeURIComponent(message)
        window.open(
          `https://api.whatsapp.com/send?text=${encoded}`,
          '_blank',
          'noopener,noreferrer',
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to share payslip'
      setError(msg)
    } finally {
      setIsSharing(false)
    }
  }, [generatePdf, payrollRunId, staffId, staffName, businessName, businessPhone, period, netSalary, staffPhone])

  const isLoading = isGenerating || isSharing

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <button
          onClick={handleView}
          disabled={isLoading}
          title="View payslip PDF"
          className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <svg
            className="h-3 w-3"
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
          {isGenerating && !isSharing ? '…' : 'Payslip'}
        </button>
        <button
          onClick={handleShare}
          disabled={isLoading}
          title="Share payslip via WhatsApp"
          className="flex items-center gap-1 rounded bg-green-700 px-2 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-green-800 disabled:opacity-50"
        >
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.252-.161-2.737.813.813-2.737-.161-.252A8 8 0 1112 20z" />
          </svg>
          {isSharing ? '…' : 'Share'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
