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

function avatarColor(name: string): string {
  const COLORS = [
    'bg-green-700',
    'bg-blue-600',
    'bg-amber-600',
    'bg-purple-600',
    'bg-teal-600',
    'bg-orange-600',
    'bg-rose-600',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
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

  const balanceIsZero = supplier.outstandingPayable === 0
  const color = avatarColor(supplier.name)
  const inits = initials(supplier.name)

  return (
    <main className="min-h-screen bg-[#F5F5F0] p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Back nav */}
        <div className="flex items-center gap-2">
          <Link
            href="/suppliers"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            aria-label="Back to suppliers"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Suppliers
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-800 truncate">{supplier.name}</span>
        </div>

        {/* Deactivate error */}
        {deactivateError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {deactivateError}
          </div>
        )}

        {/* Two-column layout */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[300px,1fr]">
          {/* ── Left Sidebar ── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              {/* Avatar + name */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${color}`}
                >
                  {inits}
                </div>
                <h1 className="mt-3 text-lg font-bold text-gray-900">{supplier.name}</h1>
                {!supplier.isActive && (
                  <span className="mt-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                    Inactive
                  </span>
                )}
                {supplier.location && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    {supplier.location}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="my-4 border-t border-gray-100" />

              {/* Contact rows */}
              <div className="space-y-3">
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-gray-50"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">PHONE</p>
                      <p className="text-sm font-medium text-green-700">{supplier.phone}</p>
                    </div>
                  </a>
                )}
                {supplier.email && (
                  <a
                    href={`mailto:${supplier.email}`}
                    className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-gray-50"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">EMAIL</p>
                      <p className="truncate text-sm font-medium text-gray-800">{supplier.email}</p>
                    </div>
                  </a>
                )}
                {supplier.momoNumber && (
                  <div className="flex items-center gap-3 rounded-lg p-1.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">MOMO</p>
                      <p className="text-sm font-medium text-gray-800">{supplier.momoNumber}</p>
                    </div>
                  </div>
                )}
                {(supplier.bankName || supplier.bankAccount) && (
                  <div className="flex items-center gap-3 rounded-lg p-1.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">BANK</p>
                      <p className="text-sm font-medium text-gray-800">
                        {supplier.bankName}
                        {supplier.bankAccount && (
                          <span className="ml-1 text-xs text-gray-500">· {supplier.bankAccount}</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Credit Terms chip */}
              {(supplier.creditTermsDays !== null && supplier.creditTermsDays !== undefined) && (
                <>
                  <div className="my-4 border-t border-gray-100" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">Credit Terms</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                      {supplier.creditTermsDays === 0
                        ? 'Payment on receipt'
                        : `${supplier.creditTermsDays} days`}
                    </span>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="mt-5 space-y-2">
                <Link
                  href={`/purchase-orders/new?supplierId=${supplier.id}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 active:bg-green-900"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                  </svg>
                  Create PO
                </Link>
                <Link
                  href={`/suppliers/${supplier.id}/edit`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={handleDownloadStatement}
                  disabled={isGeneratingPdf}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {isGeneratingPdf ? 'Generating PDF…' : 'Download Statement'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right Column ── */}
          <div className="flex flex-col gap-4">
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Outstanding Payable */}
              <div
                className={`rounded-2xl border p-4 sm:col-span-1 ${balanceIsZero ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}
              >
                <p className={`text-xs font-semibold uppercase tracking-wider ${balanceIsZero ? 'text-green-600' : 'text-amber-600'}`}>
                  Outstanding Payable
                </p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${balanceIsZero ? 'text-green-700' : 'text-amber-700'}`}>
                  GHS {formatGHS(supplier.outstandingPayable)}
                </p>
              </div>

              {/* Credit Terms */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Credit Terms</p>
                <p className="mt-1 text-base font-bold text-gray-900">
                  {supplier.creditTermsDays === 0
                    ? 'On receipt'
                    : `${supplier.creditTermsDays} days`}
                </p>
              </div>

              {/* Supplier Since */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Supplier Since</p>
                <p className="mt-1 text-base font-bold text-gray-900">
                  {supplier.createdAt.toLocaleDateString('en-GH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Profile details card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Profile Details</h2>
              <dl className="mt-4 divide-y divide-gray-100">
                <ProfileRow label="Name" value={supplier.name} />
                {supplier.phone && <ProfileRow label="Phone" value={supplier.phone} />}
                {supplier.email && <ProfileRow label="Email" value={supplier.email} />}
                {supplier.location && <ProfileRow label="Location" value={supplier.location} />}
                {supplier.momoNumber && <ProfileRow label="MoMo Number" value={supplier.momoNumber} />}
                {supplier.bankName && <ProfileRow label="Bank Name" value={supplier.bankName} />}
                {supplier.bankAccount && <ProfileRow label="Bank Account" value={supplier.bankAccount} />}
                <ProfileRow
                  label="Credit Terms"
                  value={
                    supplier.creditTermsDays === 0
                      ? 'Payment on receipt'
                      : `${supplier.creditTermsDays} days`
                  }
                />
                {supplier.notes && <ProfileRow label="Notes" value={supplier.notes} />}
              </dl>
            </div>

            {/* Deactivate */}
            {supplier.isActive && (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100"
              >
                Deactivate Supplier
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Deactivate Supplier?</h3>
            <p className="mt-2 text-sm text-gray-500">
              {supplier.name} will be hidden from your supplier list. You can reactivate them later
              from settings.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={isPending}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between py-2.5">
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="ml-4 max-w-[60%] text-right text-sm text-gray-900">{value}</dd>
    </div>
  )
}
