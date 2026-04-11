'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCustomer, type CustomerActionResult } from '@/actions/customers'

const initialState: CustomerActionResult = { success: false, error: '' }

export default function CustomerForm() {
  const [state, formAction, isPending] = useActionState(createCustomer, initialState)
  const router = useRouter()

  useEffect(() => {
    if (state.success) {
      router.push('/customers')
    }
  }, [state.success, router])

  const fieldErrors = !state.success ? state.fieldErrors : undefined

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/customers"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Back to customers"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Add Customer</h1>
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
            placeholder="e.g. Ama Serwaa"
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
            placeholder="e.g. ama@example.com"
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
            placeholder="e.g. Madina Market, Tema Comm. 1"
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

        {/* Credit Limit */}
        <div>
          <label htmlFor="creditLimit" className="block text-sm font-medium text-gray-700">
            Credit Limit (GHS)
          </label>
          <input
            id="creditLimit"
            name="creditLimit"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            defaultValue="0"
            className={`mt-1 w-full rounded-lg border px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 ${
              fieldErrors?.creditLimit
                ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
            }`}
            placeholder="0.00"
          />
          <p className="mt-1 text-xs text-gray-400">0 = cash only, no credit</p>
          {fieldErrors?.creditLimit && (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.creditLimit}</p>
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
            placeholder="Any notes about this customer"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-green-700 px-4 py-3 text-base font-semibold text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
        >
          {isPending ? 'Saving...' : 'Save Customer'}
        </button>
      </form>
    </>
  )
}
