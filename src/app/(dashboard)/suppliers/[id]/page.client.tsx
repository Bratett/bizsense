'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deactivateSupplier, type SupplierWithBalance } from '@/actions/suppliers'
import { getSupplierStatementData } from '@/actions/supplierPayments'

function formatGHS(amount: number): string {
  return amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function SupplierDetail({ supplier }: { supplier: SupplierWithBalance }) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  async function handleDownloadStatement() {
    setIsGeneratingPdf(true)
    try {
      const data = await getSupplierStatementData(supplier.id)
      const worker = new Worker(new URL('@/lib/pdf/supplierStatement.worker.ts', import.meta.url))
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'success') {
          const url = URL.createObjectURL(e.data.blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `statement-${supplier.name.replace(/\s+/g, '-').toLowerCase()}.pdf`
          a.click()
          URL.revokeObjectURL(url)
        }
        worker.terminate()
        setIsGeneratingPdf(false)
      }
      worker.onerror = () => {
        worker.terminate()
        setIsGeneratingPdf(false)
      }
      worker.postMessage({ type: 'generate', data })
    } catch {
      setIsGeneratingPdf(false)
    }
  }

  function handleDeactivate() {
    setDeactivateError(null)
    startTransition(async () => {
      const result = await deactivateSupplier(supplier.id)
      if (result.success) {
        router.push('/suppliers')
      } else {
        setShowConfirm(false)
        setDeactivateError(result.error)
      }
    })
  }

  const balanceColor =
    supplier.outstandingPayable === 0
      ? 'text-green-700 bg-green-50 border-green-200'
      : 'text-amber-700 bg-amber-50 border-amber-200'

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/suppliers"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Back to suppliers"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-gray-900">{supplier.name}</h1>
            {supplier.phone && (
              <a href={`tel:${supplier.phone}`} className="text-sm text-green-700 hover:underline">
                {supplier.phone}
              </a>
            )}
          </div>
          {!supplier.isActive && (
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              Inactive
            </span>
          )}
        </div>

        {/* Deactivate error */}
        {deactivateError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {deactivateError}
          </div>
        )}

        {/* Balance Card */}
        <div className={`mt-4 rounded-xl border p-4 ${balanceColor}`}>
          <p className="text-xs font-medium opacity-70">Outstanding Payable</p>
          <p className="mt-1 text-2xl font-semibold">
            GHS {formatGHS(supplier.outstandingPayable)}
          </p>
        </div>

        {/* Profile */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Profile</h2>
          <dl className="mt-3 space-y-3">
            <ProfileField label="Name" value={supplier.name} />
            <ProfileField label="Phone" value={supplier.phone} />
            <ProfileField label="Email" value={supplier.email} />
            <ProfileField label="Location" value={supplier.location} />
            <ProfileField label="MoMo Number" value={supplier.momoNumber} />
            <ProfileField label="Bank Name" value={supplier.bankName} />
            <ProfileField label="Bank Account" value={supplier.bankAccount} />
            <ProfileField
              label="Credit Terms"
              value={
                supplier.creditTermsDays === 0
                  ? 'Payment on receipt'
                  : `${supplier.creditTermsDays} days`
              }
            />
            <ProfileField label="Notes" value={supplier.notes} />
            <ProfileField
              label="Supplier Since"
              value={supplier.createdAt.toLocaleDateString('en-GH', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
          </dl>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <Link
            href={`/purchase-orders/new?supplierId=${supplier.id}`}
            className="flex-1 rounded-lg bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
          >
            Create PO
          </Link>
          <Link
            href={`/suppliers/${supplier.id}/edit`}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            Edit
          </Link>
        </div>

        <button
          type="button"
          onClick={handleDownloadStatement}
          disabled={isGeneratingPdf}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
        >
          {isGeneratingPdf ? 'Generating PDF…' : 'Download Statement'}
        </button>

        {supplier.isActive && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="mt-3 w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
          >
            Deactivate Supplier
          </button>
        )}

        {/* Confirmation Modal */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Deactivate Supplier?</h3>
              <p className="mt-2 text-sm text-gray-500">
                {supplier.name} will be hidden from your supplier list. You can reactivate them
                later from settings.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {isPending ? 'Deactivating...' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '\u2014'}</dd>
    </div>
  )
}
