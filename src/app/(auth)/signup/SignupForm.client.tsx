'use client'

import { useActionState } from 'react'
import { signUp, type SignUpState } from '@/actions/auth'

const initialState: SignUpState = { errors: {} }

export default function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {/* General error banner */}
      {state.errors.general && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
        >
          {state.errors.general}
        </div>
      )}

      {/* Full Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className="text-sm font-medium text-gray-700">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          disabled={isPending}
          className={`rounded-lg border px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400
                     ${state.errors.fullName ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-green-600'}`}
          placeholder="Kwame Asante"
        />
        {state.errors.fullName && <p className="text-sm text-red-600">{state.errors.fullName}</p>}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          disabled={isPending}
          className={`rounded-lg border px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400
                     ${state.errors.email ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-green-600'}`}
          placeholder="you@example.com"
        />
        {state.errors.email && <p className="text-sm text-red-600">{state.errors.email}</p>}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          className={`rounded-lg border px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400
                     ${state.errors.password ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-green-600'}`}
          placeholder="Min. 8 characters"
        />
        {state.errors.password && <p className="text-sm text-red-600">{state.errors.password}</p>}
      </div>

      {/* Business Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="businessName" className="text-sm font-medium text-gray-700">
          Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          autoComplete="organization"
          required
          disabled={isPending}
          maxLength={100}
          className={`rounded-lg border px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400
                     ${state.errors.businessName ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-green-600'}`}
          placeholder="e.g. Ama's Trading Store"
        />
        {state.errors.businessName && (
          <p className="text-sm text-red-600">{state.errors.businessName}</p>
        )}
      </div>

      {/* Phone (optional) */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-sm font-medium text-gray-700">
          Phone number
          <span className="ml-1 text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          disabled={isPending}
          className={`rounded-lg border px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400
                     ${state.errors.phone ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-green-600'}`}
          placeholder="0XX XXX XXXX"
        />
        {state.errors.phone ? (
          <p className="text-sm text-red-600">{state.errors.phone}</p>
        ) : (
          <p className="text-xs text-gray-400">For account recovery via SMS</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold
                   text-white transition-colors hover:bg-green-800 active:bg-green-900
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Creating account\u2026' : 'Create Account'}
      </button>
    </form>
  )
}
