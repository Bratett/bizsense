'use client'

import { useActionState } from 'react'
import { signIn } from '@/actions/auth'

const initialState = { error: '' }

export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {/* Error banner */}
      {state.error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </div>
      )}

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
          className="rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:border-green-600 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="you@example.com"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">
            Password
          </label>
          <span className="text-xs text-gray-400 cursor-default" title="Coming soon">
            Forgot password?
          </span>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900
                     placeholder:text-gray-400 focus:border-green-600 focus:outline-none
                     focus:ring-2 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 rounded-lg bg-green-700 px-4 py-3 text-base font-semibold
                   text-white transition-colors hover:bg-green-800 active:bg-green-900
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Signing in\u2026' : 'Sign in'}
      </button>
    </form>
  )
}
