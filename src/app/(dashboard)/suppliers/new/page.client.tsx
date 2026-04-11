'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupplier, type SupplierActionResult } from '@/actions/suppliers'

const initialState: SupplierActionResult = { success: false, error: '' }

export default function NewSupplierForm() {
  const [state, formAction, isPending] = useActionState(createSupplier, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.success) {
      router.push('/suppliers')
    }
  }, [state.success, router])

  const fieldErrors = !state.success ? state.fieldErrors : undefined

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/suppliers"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Back to suppliers"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Add Supplier</h1>
      </div>

      {/* General error */}
      {!state.success && state.error && !state.fieldErrors && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={255}
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
              fieldErrors?.name
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
            }`}
            placeholder="e.g. Accra Supplies Ltd"
          />
          {fieldErrors?.name && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
              fieldErrors?.phone
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
            }`}
            placeholder="e.g. 0241234567"
          />
          {fieldErrors?.phone && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. info@supplier.com"
          />
        </div>

        {/* Location */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700">
            Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. Tema Industrial Area"
          />
        </div>

        {/* MoMo Number */}
        <div>
          <label htmlFor="momoNumber" className="block text-sm font-medium text-gray-700">
            Mobile Money Number
          </label>
          <input
            id="momoNumber"
            name="momoNumber"
            type="tel"
            inputMode="tel"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. 0241234567"
          />
        </div>

        {/* Bank Name */}
        <div>
          <label htmlFor="bankName" className="block text-sm font-medium text-gray-700">
            Bank Name
          </label>
          <input
            id="bankName"
            name="bankName"
            type="text"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. GCB Bank"
          />
        </div>

        {/* Bank Account */}
        <div>
          <label htmlFor="bankAccount" className="block text-sm font-medium text-gray-700">
            Bank Account Number
          </label>
          <input
            id="bankAccount"
            name="bankAccount"
            type="text"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="e.g. 1234567890"
          />
        </div>

        {/* Credit Terms */}
        <div>
          <label htmlFor="creditTermsDays" className="block text-sm font-medium text-gray-700">
            Credit Terms (days) <span className="text-red-500">*</span>
          </label>
          <input
            id="creditTermsDays"
            name="creditTermsDays"
            type="number"
            inputMode="numeric"
            min={0}
            step="1"
            defaultValue="0"
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
              fieldErrors?.creditTermsDays
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
            }`}
            placeholder="0"
          />
          <p className="mt-1 text-xs text-gray-400">0 = payment due on receipt</p>
          {fieldErrors?.creditTermsDays && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.creditTermsDays}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-100"
            placeholder="Any notes about this supplier"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
        >
          {isPending ? 'Saving...' : 'Save Supplier'}
        </button>
      </form>
    </>
  )
}
